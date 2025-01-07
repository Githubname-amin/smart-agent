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
 * 标准请求体
 */
export class WebsocketRequest{
  constructor(data,url,traceId){
    this.data = data
    this.url = url
    this.traceId = traceId
  }
}

/**
 * 标准响应体
 */
export class WebsocketResponse{
  constructor(data,message,traceId,success){
    this.data =data
    this.message = message
    this.traceId = traceId
    this.success = success
  }
}


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
        this.send({
          type: "responseSuccess",
          traceId: data.traceId,
          success: res.success,
          data: res.data ?? null
        });
        return;
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

  
  /**
   * 发送请求
   * @param {*} url 请求地址
   * @param {*} data 请求参数
   * @returns 
   */
  async request(url,data){
    const websocketRequest = WebsocketRequest(
      data = data,
      url = url,
      traceId = generateTraceId()
    )
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
          ...websocketRequest,
          type: "requestSend"
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