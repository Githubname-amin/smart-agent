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

// export const sendMessage = async (currentMessage) => {
//   try {
//     const response = await axios.post(
//       "http://localhost:6688/api/test_chat_ali",
//       {
//         messages: {
//           role: "user",
//           content: currentMessage
//         },
//         context: "这是上下文，我们规定每次交谈的最初一个字是 哦"
//       },
//       {
//         headers: {
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     console.log("response", response);
//   } catch (error) {
//     console.error("Error sending message:", error);
//   }
// };

class nowUserActionMessages {
  constructor(userTraceId) {
    this.userTraceId = userTraceId; // 用户traceId，用来记录消息历史
    this.traceId = []; // 当前用户操作的traceId，仅用来记录上下文历史，在对话的时候没有什么意义
    this.messages = []; // 当前用户操作的消息，记录所有的对话记录，后续上传
  }

  // 添加消息
  addMessage(message) {
    this.messages.push(message);
  }

  // 清空消息
  clearMessages() {
    this.messages = [];
  }

  // 获取消息
  getMessages() {
    return this.messages;
  }

  // 修改信息
  updateMessages(messages) {}

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
  initMessages(currentMessages, traceId) {
    this.messages = [...this.messages, ...currentMessages];
    this.traceId = [...this.traceId, ...traceId];
  }
}

// -------------------------------
// 使用上面的类

export let nowUserActionMessageClient = new nowUserActionMessages("1234");

// 尝试改造成nodejs的流式响应,但是发现要根据他的字段参数去调整整体逻辑.所有返回确定请求方式
export const sendHTTPChat = async function* (currentMessage) {
  console.log("sendHTTPChat", currentMessage);
  nowUserActionMessageClient.addMessage({
    role: "user",
    content: currentMessage
  });
  try {
    const data = {
      model: "qwen-turbo",
      input: {
        messages: [...nowUserActionMessageClient.getMessages()]
      },
      parameters: {
        stream: true,
        incremental_output: true
      }
    };
    console.log("data???", data);
    debugger;
    let response;
    if (isIntelliJEnvironment) {
      response = await axios.post(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        data,
        {
          headers: {
            "Content-Type": "application/json",
            "X-DashScope-SSE": "enable",
            Authorization: "Bearer " + ALI_CONFIG.apiKey
          }
        }
      );
      console.log("response，在idea", response);
    } else {
      response = await fetch("http://localhost:3021/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });
      console.log("response，在本地", response);
      if (!response && response?.status !== 200) {
        throw new Error("请求失败");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          console.log("Stream chunk received:", !!value, done); // 调试日志

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          // 保留最后一个可能不完整的行
          buffer = lines.pop() || "";
          console.log("lines", lines);
          for (const line of lines) {
            console.log("line11", line);
            if (line.trim() && line.startsWith("data:")) {
              try {
                const jsonStr = line.replace(/^data:\s*/, "").trim();
                if (jsonStr) {
                  const parsedData = JSON.parse(jsonStr);
                  console.log("Parsed data:", parsedData); // 调试日志
                  yield parsedData;
                }
              } catch (e) {
                console.warn("Failed to parse line:", line, e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export const sendMessageTest = async function* (currentMessage) {
  nowUserActionMessageClient.addMessage({
    role: "user",
    content: currentMessage
  });
  try {
    const response = await openai.chat.completions.create({
      model: "qwen-turbo",
      messages: [...nowUserActionMessageClient.getMessages()],
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
let messages = [];

// 修改messages
export const updateMessages = (currentMessages) => {
  messages = [...messages, ...currentMessages];
};
// 对话结束或者新增对话的时候，需要清空messages
export const clearMessages = () => {
  messages = [];
};

// 获取messages
export const getMessages = () => {
  return messages;
};

export const initMessage = async (initMessages) => {
  updateMessages(initMessages);

  const data = {
    model: "qwen-turbo",
    input: {
      messages: getMessages()
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
