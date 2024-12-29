import ReconnectingWebSocket from "reconnecting-websocket";

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
    // url = pluginParams.get(
    //   `127.0.0.1:${pluginParams.get("port")}?clientId=CHAT`
    // )
    url = "ws://127.0.0.1:3020"
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
    this.connect();
  }

  connect() {
    this.ws = new ReconnectingWebSocket(this.url, [], options);

    this.ws.addEventListener("open", () => {
      this.onOpen();
    });

    this.ws.addEventListener("message", (event) => {
      this.onMessage(event);
    });

    this.ws.addEventListener("error", (error) => {
      this.onError(error);
    });

    this.ws.addEventListener("close", (event) => {
      console.log("WebSocket 连接关闭", event);
    });

    // 监听重连事件
    this.ws.addEventListener("connecting", (event) => {
      this.onConnecting();
      this.updateStatus(WebSocketStatus.CONNECTING);
    });
  }

  // ----------------------------------------------------------------
  // websocket 的一些事件

  onOpen() {
    console.log("WebSocket 连接成功");
    // 连接成功后发送队列中的消息（防止之前意外断开）
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(event) {
    try {
      const response = JSON.parse(event.data);
      if (response.success && response?.traceId) {
        console.log("websocket收到消息", response);
        // 判断服务端传递什么信息
        // 是否是接口
        if (typeof response.url === "string") {
          // 是接口
          switch (response.url) {
            case "/chat/selectCode":
              // 服务端传递某些代码给到前端
              if (this.apiCallbackFns[response.url]) {
                this.apiCallbackFns[response.url](this.ws, response);
              }
              break;
            case "/chat/insertCodeToEditor":
              // 服务端传递某些代码给到前端
              if (this.apiCallbackFns[response.url]) {
                this.apiCallbackFns[response.url](this.ws, response);
              }
              break;
            case "/chat/prompt":
              // 服务端传递prompt给到前端
              if (this.apiCallbackFns[response.url]) {
                this.apiCallbackFns[response.url](this.ws, response);
              }
              break;
            default:
              console.log("未知的url", response.url);
              break;
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
        // reject(new Error("WebSocket 未连接"));
        //  等待重连
        return;
      }

      try {
        this.ws.send(JSON.stringify(message));
        resolve();
      } catch (error) {
        console.error("WebSocket 发送消息失败", error);
        reject(error);
      }
    });
  }
}
//---------------------------------------------
/**
 * 生成traceId
 */
function generateTraceId() {
  let timestamp = new Date().getTime();
  let random = Math.floor(Math.random() * 1000000);
  return `trace_${timestamp}_${random}`;
}

export const websocketClient = new WebSocketClient();
// 检查连接状态

/** 获取想要查询的代码，作为上下文 */
export async function getSelectCode(url = "/chat/selectCode") {
  const request = {
    traceId: "123",
    message: []
  };
  try {
    const response = await websocketClient.sendMessage(url, request);
    console.log("前端获取到代码", response);
    return response;
  } catch (error) {
    console.error("获取代码失败", error);
  }
}

/** 前端申请插入代码到编辑器 */
export async function insertCodeToEditor(url = "/chat/insertCodeToEditor") {
  const request = {
    success: true,
    traceId: "1234",
    data: {
      code: `java
    public class Main {
        public static void main(String[] args) {
            int a = 5;
            int b = 10;
            System.out.println("两数之和为: " + (a + b));
        }
    }`,
      message: "处理选择代码逻辑,服务端传递代码来前端"
    }
  };
  const response = await websocketClient.sendMessage(url, request);
  console.log("前端插入代码到编辑器", response);
  return response;
}
// 接口处理函数
export function registerApiCallbackFn(url, callback) {
  websocketClient.apiCallbackFns[url] = callback;
}
