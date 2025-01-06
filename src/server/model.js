// 与大模型交互的接口定义处
import { MODEL_CONFIG } from "./config";
import axios from "axios";

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

  /**
   * 添加消息
   * @param {*消息，包含role,content,type，type分为 activelyAdd,requestAdd,promptAdd} chatData 消息
   */
  addChatData(chatData) {
    if (Array.isArray(chatData)) {
      this.chatDatas.push(...chatData);
    } else {
      this.chatDatas.push(chatData);
    }
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

  // 修改当前对话涉及到上下文 traceId
  updateTraceId(traceId) {}

  // 初始化对象程序，写入一些背景 prompt
  initChatDatas(currentChatDatas, traceId) {
    this.addChatData(currentChatDatas);
    this.addTraceId(traceId);
  }

  // 对话结束后，清空整体上下文，返回当前记录的所有数据
  clearAllUserHistoryData() {
    const result = {
      userTraceId: this.userTraceId,
      chatDatas: [...this.chatDatas],
      traceId: [...this.traceId]
    };
    this.chatDatas = [];
    this.traceId = [];
    return result;
  }
}

// -------------------------------
// 使用上面的类

export let userHistoryDataClient = new userHistoryDatas("1234");

// 尝试改造成nodejs的流式响应,但是发现要根据他的字段参数去调整整体逻辑.所有返回确定请求方式
export const sendHTTPChat = async function ({ model }) {
  console.log("sendHTTPChat", userHistoryDataClient.getChatDatas());
  // userHistoryDataClient.addChatData({
  //   role: "user",
  //   content: currentChatData
  // });
  try {
    // 根据不同模型，有不同的处理
    switch (model) {
      case "qwen-turbo":
        return qwenTurbo("qwen-turbo");
      case "qwen-plus":
        return qwenTurbo("qwen-plus");
      case "qwen-mini":
        return qwenTurbo("qwen-mini");
      case "ollama":
        return ollama();
      default:
        break;
    }
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

// -------------------------------
// 选择 qwen-turbo 模型
const qwenTurbo = async function* (model) {
  const nowData = {
    model: model,
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
          Authorization: `Bearer ${MODEL_CONFIG.apiKey}`,
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
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      console.log("buffer", buffer);
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
              const nowResult = {
                content: parsedData?.choices[0]?.delta?.content,
                finish_reason: parsedData?.choices[0]?.finish_reason === "stop",
                traceId: parsedData?.choices[0]?.trace_id
              };
              yield nowResult;
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
};

// 选择 ollama 模型
const ollama = async function* () {
  const ollamaConfig = {
    apiUrl: "http://localhost:11434/api/chat",
    modelName: "qwen2.5"
  };
  try {
    const response = await fetch(ollamaConfig.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: ollamaConfig.modelName,
        messages: [...userHistoryDataClient.getChatDatas()],
        stream: true
      })
    });
    // 获取到数据,流式数据需要处理
    console.log("response66777", response);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const decodeValue = decoder.decode(value, { stream: true });
      buffer += decodeValue;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }
        try {
          const jsonStr = line.replace(/^data:\s*/, "").trim();
          if (jsonStr) {
            const parsedData = JSON.parse(jsonStr);
            const nowResult = {
              content: parsedData?.message?.content,
              finish_reason: parsedData?.done
            };
            yield nowResult;
          }
        } catch (e) {
          console.warn("Failed to parse line(Ollama):", line, e);
        }
      }

      // 处理最后可能剩余的数据
      if (buffer.trim() !== "") {
        try {
          const decodeValue = JSON.parse(buffer);
          const nowResult = {
            content: decodeValue?.message?.content,
            finish_reason: decodeValue?.done
          };
          yield nowResult;
        } catch (e) {
          console.error("Failed to parse line(Ollama):", e);
        }
      }
    }
    // console.log("buffer", buffer);
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

// -------------------------------

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

// 现在没有走这里的请求，而是走的node端的请求
export const initChatData = async (initChatDatas) => {
  const data = {
    model: "qwen-turbo",
    input: {
      messages: userHistoryDataClient.getChatDatas()
    },
    parameters: {
      stream: true
    }
  };

  const response = await axios.post("http://localhost:3021/api/chat", data, {
    headers: {
      "Content-Type": "application/json"
    }
  });
  console.log("response11111,调试", response);
};
