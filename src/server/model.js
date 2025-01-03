// 与大模型交互的接口定义处
import OpenAI from "openai";
import { ALI_CONFIG } from "./config";
const axios = require("axios");

// 判断是否是IntelliJ环境
const isIntelliJEnvironment = window.intellij !== undefined;
const openai = new OpenAI({
  // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
  apiKey: ALI_CONFIG.apiKey,
  dangerouslyAllowBrowser: true, // 注意：仅在充分了解风险并采取了安全措施后启用
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
});

/**
 * 用户对话历史类，后续展示对话概述，从而定位到聊天历史
 * userTraceId: 用户traceId，用来记录消息历史
 * traceId: 当前用户操作过的traceId，仅用来记录上下文历史，在对话的时候没有什么意义
 * chatDatas: 当前用户操作的消息，记录所有的对话记录，后续上传
 */
class userHistoryDatas {
  constructor(userTraceId) {
    this.userTraceId = userTraceId;
    this.traceId = [];
    this.chatDatas = [];
  }

  // 添加消息
  addChatData(chatData) {
    this.chatDatas.push(chatData);
  }

  // 清空消息
  clearChatDatas() {
    this.chatDatas = [];
  }

  // 获取消息
  getChatDatas() {
    return this.chatDatas;
  }

  // 修改信息
  updateChatDatas(chatDatas) {}

  // 增加当前对话涉及到上下文 traceId
  addTraceId(traceId) {
    this.traceId.push(traceId);
  }

  // 获取当前对话涉及到上下文 traceId
  getTraceId() {
    return this.traceId;
  }

  // 清空当前对话涉及到上下文 traceId
  clearTraceId() {
    this.traceId = [];
  }

  // 修改当前对话涉及到上下文 traceId
  updateTraceId(traceId) {}

  // 初始化对象程序，写入一些背景 prompt
  initChatDatas(currentChatDatas, traceId) {
    this.chatDatas = [...this.chatDatas, ...currentChatDatas];
    this.traceId = [...this.traceId, ...traceId];
  }
}

// -------------------------------
// 使用上面的类

export let userHistoryDataClient = new userHistoryDatas("1234");

// 尝试改造成nodejs的流式响应,但是发现要根据他的字段参数去调整整体逻辑.所有返回确定请求方式
export const sendHTTPChat = async function* (currentChatData) {
  console.log("sendHTTPChat", currentChatData);
  userHistoryDataClient.addChatData({
    role: "user",
    content: currentChatData
  });
  try {
    // const data = {
    //   model: "qwen-turbo",
    //   input: {
    //     messages: [...userHistoryDataClient.getChatDatas()]
    //   },
    //   parameters: {
    //     stream: true,
    //     incremental_output: true
    //   }
    // };
    // console.log("data???", data);
    const nowData = {
      model: "qwen-turbo",
      messages: [...userHistoryDataClient.getChatDatas()],
      stream: true
    };

    try {
      const response = await fetch(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer sk-f3aa6b3f9ab74a41a39656b162155f9b`,
            Accept: "text/event-stream",
            "X-DashScope-SSE": "enable"
          },
          body: JSON.stringify(nowData)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader(); //转变为 ReadableStreamDefaultReader 类型，获取流
      const decoder = new TextDecoder();
      let buffer = "";
      console.log("reader", reader);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // 保留未完成的行
        // console.log("lines", lines);
        for (const line of lines) {
          if (line.trim() && line.startsWith("data:")) {
            // console.log("line", line);
            try {
              const jsonStr = line.replace(/^data:\s*/, "").trim();
              if (jsonStr) {
                const parsedData = JSON.parse(jsonStr);
                // 使用 yield 逐个返回数据
                yield parsedData;
              }
            } catch (e) {
              console.warn("Failed to parse line:", line, e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Stream error:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export const sendChatDataTest = async function* (currentChatData) {
  userHistoryDataClient.addChatData({
    role: "user",
    content: currentChatData
  });
  try {
    const response = await openai.chat.completions.create({
      model: "qwen-turbo",
      messages: [...userHistoryDataClient.getChatDatas()],
      stream: true
    });
    // console.log("response", response, JSON.stringify(response));
    // if (response && response?.id) {
    //   return response.choices[0];
    // }
    for await (const chunk of response) {
      //   console.log(chunk.choices[0].delta.content);
      if (chunk.choices[0].delta.content) {
        // yield chunk.choices[0].delta.content;
        yield chunk;
      }
    }
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

// 设置对话上下文，初次的时候传入后端传入的prompt，否则自定义.|如果后续需要记录对话历史，则需要设定用户层面的traceId
let chatDatas = [];

// 修改messages
export const updateChatDatas = (currentChatDatas) => {
  chatDatas = [...chatDatas, ...currentChatDatas];
};
// 对话结束或者新增对话的时候，需要清空messages
export const clearChatDatas = () => {
  chatDatas = [];
};

// 获取messages
export const getChatDatas = () => {
  return chatDatas;
};

// 现在没有走这里的请求，而是走的node端的请求
export const initChatData = async (initChatDatas) => {
  updateChatDatas(initChatDatas);

  const data = {
    model: "qwen-turbo",
    input: {
      messages: getChatDatas()
    },
    parameters: {
      stream: true
    }
  };
  if (isIntelliJEnvironment) {
    // 在axios的post里面规范header和body
    const response = await axios.post(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
      {
        body: data,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + ALI_CONFIG.apiKey
        }
      }
    );
    console.log("response初始，在idea", response);
  } else {
    const response = await axios.post("http://localhost:3021/api/chat", data, {
      headers: {
        "Content-Type": "application/json"
      }
    });
    console.log("response11111,调试", response);
  }
};
