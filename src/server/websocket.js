import ReconnectingWebSocket from "reconnecting-websocket";
import { generateTraceId } from "../utils";

function getUrlParams(url) {
  const searchParams = new URLSearchParams(url);
  const params = new Map();
  for (const [key, value] of searchParams) {
    params.set(key, value);
  }
  return params;
}

/**
 * port:string          端口号
 * isDark:bool          是否黑色主题
 * projectMD5:string    项目md5
 * pluginVersion:string 插件版本
 */
export const pluginParams = getUrlParams(window.location.search);

export const WebSocketStatus = {
  CONNECTING: "CONNECTING",
  OPEN: "OPEN",
  CLOSING: "CLOSING",
  CLOSED: "CLOSED",
  ERROR: "ERROR"
};

/**
 * 是否为请求体
 * @param {*} data
 * @returns
 */
export const isRequest = (data) => {
  return typeof data.url === "string";
};

/**
 * 是否为响应体
 * @param {*} data
 * @returns
 */
export const isResponse = (data) => {
  return typeof data.success === "boolean";
};

// 配置重连参数
const options = {
  maxRetries: 10, // 最大重试次数
  reconnectionDelayGrowFactor: 1.3, // 重新连接延迟增长的速度
  minReconnectionDelay: 1000, // 最小重连延迟(ms)
  maxReconnectionDelay: 5000, // 最大重连延迟(ms)
  connectionTimeout: 4000 // 连接超时时间(ms)
};

class WebSocketClient {
  constructor(
    url = `ws://127.0.0.1:${pluginParams.get("port")}?clientId=CHAT`
  ) {
    this.url = url;
    this.ws = null;
    this.messageQueue = [];
    // 用字段记录当前webscoket的状态，用来页面交互
    this.wsState = "";
    // 记录监听行为
    this.statusChangeCallbacks = [];
    // 记录接口处理函数
    this.apiCallbackFns = {};
    // this.connect();
  }
  callbacks = new Map();

  // 初始化整个对象
  connect() {
    this.ws = new ReconnectingWebSocket(this.url, [], options);

    this.ws.addEventListener("open", () => {
      this.onOpen();
      this.updateStatus(WebSocketStatus.OPEN);
    });

    this.ws.addEventListener("message", (event) => {
      console.log("WebSocket 收到消息111", event);
      this.onMessage(event);
    });

    this.ws.addEventListener("error", (error) => {
      this.onError(error);
    });

    this.ws.addEventListener("close", (event) => {
      // console.log("WebSocket 连接关闭", event);
    });

    // 监听重连事件
    this.ws.addEventListener("connecting", (event) => {
      this.onConnecting();
      this.updateStatus(WebSocketStatus.CONNECTING);
    });
  }

  /**
   * 发送消息
   * @param {*} data
   */
  send(data) {
    this.ws.send(JSON.stringify(data));
  }

  // ----------------------------------------------------------------
  // websocket 的一些事件

  onOpen() {
    console.log("WebSocket 连接成功");
    // 连接成功后发送队列中的消息（防止之前意外断开）
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send({
        ...message,
        type: "requestOpen"
      });
    }
  }

  onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      // 处理请求
      if (isRequest(data)) {
        console.log("websocket的请求", this.apiCallbackFns);
        if (!this.apiCallbackFns[data.url]) {
          console.error("未知的url", data.url);
          // 每次请求完会再通知服务端
          this.send({
            type: "responseError",
            traceId: data.traceId,
            success: false,
            errorMsg: `${data.url} 未定义`
          });
          return;
        }
        const res = this.apiCallbackFns[data.url](this.ws, data);
        console.log("onMessage的succeed", res);
        // 每次分析完服务端传递过来的数据后，需要返回报文给服务端
        // this.send({
        //   type: "responseSuccess",
        //   traceId: data.traceId,
        //   success: data?.success ?? true,
        //   data: data?.data ?? null
        // });
        // return;
      }

      // 处理响应
      if (isResponse(data)) {
        if (this.callbacks.has(data.traceId)) {
          if (data.success) {
            // 成功
            this.callbacks.get(data.traceId).resolve(data);
          } else {
            // 失败
            this.callbacks.get(data.traceId).reject(data);
          }
        }
      }
    } catch (error) {
      console.error("解析消息失败", error);
    }
  }

  onError(error) {
    console.error("WebSocket 连接错误", error);
    this.updateStatus(WebSocketStatus.ERROR);
  }

  onConnecting() {
    console.log("正在尝试重连...");
  }

  // 注销ws示例
  onClose() {
    this.updateStatus(WebSocketStatus.CLOSED);
    console.log("手动关闭连接", this.ws);
    if (this.ws) {
      this.ws.removeEventListener("message", this.onMessage);
      this.ws.removeEventListener("error", this.onError);
      // this.ws.removeEventListener("close", this.onClose);
      this.ws.removeEventListener("connecting", this.onConnecting);
      this.ws.close(1000, "手动关闭连接", { keepClosed: true });
    }
    this.ws = null;
  }

  // 手动重连，是用来前期测试查看情况的
  onReconnect() {
    if (this.ws) {
      this.ws.reconnect();
    } else {
      this.connect();
    }
  }

  // ----------------------------------------------------------------
  /** 监听状态变化 */
  onStatusChange(callback) {
    this.statusChangeCallbacks.push(callback);
  }

  // 移除监听
  removeStatusChange(callback) {
    this.statusChangeCallbacks = this.statusChangeCallbacks.filter(
      (cb) => cb !== callback
    );
  }

  /** 触发状态变化 */
  updateStatus(newStatus) {
    this.wsState = newStatus;
    this.statusChangeCallbacks.forEach((callback) => callback(newStatus));
  }

  /** 发送消息 */
  async sendMessage(url, request) {
    return new Promise((resolve, reject) => {
      const traceId = generateTraceId();
      const message = {
        url,
        request,
        traceId
      };

      // 检查是否链接websocket，如果没连接可能意外断开，则需要在重连的时候发送信息
      //  将当前信息储存在队列中
      if (!this.ws || this.ws.readyState !== WebSocketStatus.OPEN) {
        this.messageQueue.push(message);
        console.log("websocket未连接，将信息储存在队列中", this.messageQueue);
        // reject(new Error("WebSocket 未连接"));
        //  等待重连
        return;
      }

      return new Promise((resolve, reject) => {
        this.callbacks.set(message.traceId, { resolve, reject });
        this.send({
          ...message,
          type: "requestSend"
        });
      });
    });
  }

  /**初始化整个webscoket */
  async init() {
    try {
      if (Object.keys(this.apiCallbackFns).length === 0) {
        throw new Error("未注册任何接口");
      }
      await this.connect();
      return true;
    } catch (error) {
      console.error("WebSocket 初始化失败", error);
      throw error;
    }
  }
}
//---------------------------------------------

export const websocketClient = new WebSocketClient();
// 检查连接状态
// 接口处理函数，在页面之初注册对应的执行事件
export function registerApiCallbackFn(url, callback) {
  websocketClient.apiCallbackFns[url] = callback;
}

// 向外抛出的websocket接口
/** 前端选中一段代码，传递给服务端，插入到idea的光标处 */
export async function handleInsertCodeToWeb(url = "chat/insert_code") {
  const request = {
    traceId: "123",
    data: {
      code: "java代码"
    }
  };
  try {
    const response = await websocketClient.sendMessage(url, request);
    console.log("前端获取到代码", response);
    if (true) {
      // 考虑是在这里做独特的send，还是走响应拦截器的send
      // websocketClient.send({
      //   type: "handleInsertCodeToWebResponseSuccess",
      //   success: true,
      //   tracerId: "xxxx"
      // });
    }
    return response;
  } catch (error) {
    console.error("获取代码失败", error);
  }
}

/**前端请求服务端，得到一段文件目录，展示选择框，然后选择、暂存，为后续插入文件做准备 */
export async function handleQueryFileToEditor(url = "/chat/query_directories") {
  const request = {
    traceId: "1234" //当前请求的traceId
  };
  const response = await websocketClient.sendMessage(url, request);
  console.log(
    "前端请求服务端，得到一段文件目录，展示选择框，然后选择、暂存，为后续插入文件做准备",
    response
  );
  if (true) {
    // 考虑是在这里做独特的send，还是走响应拦截器的send
    websocketClient.send({
      type: "handleQueryFileToEditorResponseSuccess",
      success: true,
      tracerId: "xxxx",
      data: {
        directories: [], //所有的文件目录
        defaultDirectory: "", //默认自动填充的目录
        defaultFileName: "" //默认自动填充的文件名
      }
    });
  }
  return response;
}

/** 前端选中一段代码，传递给服务端，插入到idea的文件中 */
export async function handleInsertFileToEditor(
  path = "",
  url = "/chat/insert_file"
) {
  const request = {
    traceId: "1234", //当前请求的traceId
    data: {
      code: `java
    public class Main {
        public static void main(String[] args) {
            int a = 5;
            int b = 10;
            System.out.println("两数之和为: " + (a + b));
        }
    }`,
      contextTraceId: "1234", // 插件段发起请求的traceId，没有则不传
      path: "", //保存文件的目录.上面接口供用户选择，选择结果.
      fileName: "" //保存文件的名称
    }
  };
  const response = await websocketClient.sendMessage(url, request);
  console.log("前端插入代码到编辑器的文件内", response);
  if (true) {
    // 考虑是在这里做独特的send，还是走响应拦截器的send
    // websocketClient.send({
    //   type: "handleInsertFileToEditorResponseSuccess",
    //   success: true,
    //   tracerId: "xxxx"
    // });
  }
  return response;
}
