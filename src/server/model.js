// 与大模型交互的接口定义处
import OpenAI from "openai";
import { ALI_CONFIG } from "./config";
const axios = require("axios");

// 判断是否是IntelliJ环境
const isIntelliJEnvironment = window.intellij !== undefined;

const data = {
  traceId: "1234567890",
  message: [
    {
      role: "user",
      content: "你好，我是小明，我有一个问题需要你帮我解决。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    },
    {
      role: "user",
      content: "好的，谢谢你。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    },
    {
      role: "user",
      content: "你好，我是小明，我有一个问题需要你帮我解决。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    },
    {
      role: "user",
      content: "好的，谢谢你。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    },
    {
      role: "user",
      content: "你好，我是小明，我有一个问题需要你帮我解决。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    },
    {
      role: "user",
      content: "好的，谢谢你。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    },
    {
      role: "user",
      content: "你好，我是小明，我有一个问题需要你帮我解决。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    },
    {
      role: "user",
      content: "好的，谢谢你。"
    },
    {
      role: "assistant",
      content: "好的，我会帮你解决这个问题。"
    }
  ]
};

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
export const sendMessageTest = async function* (currentMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: "qwen-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: currentMessage }
      ],
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
