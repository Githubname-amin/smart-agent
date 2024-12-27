// import { isEmpty } from '@/utils/global-utils';
// import HonLocatorGenerator, { OutputType } from '@alipay/hon-locator-generator';
// import { message } from 'antd';
// import ReconnectingWebSocket from 'reconnecting-websocket';
// import { ErrorScenes } from './common/LogUtil';
// import { error } from './common/LogUtil';

// function getUrlParams(url){
//   const searchParams = new URLSearchParams(url);
//   const params = new Map();
//   for (const [key, value] of searchParams) {
//     params.set(key, value);
//   }
//   return params;
// }

// /**
//  * port:string          端口号
//  * isDark:bool          是否黑色主题
//  * projectMD5:string    项目md5
//  * isCloudIDE:bool     是否云IDE环境
//  */
// export const pluginParams = getUrlParams(window.location.search);

// export interface WebSocketRequest {
//   data: any;
//   url: string;
//   traceId: string;
//   projectMD5: string;
// }

// export interface WebSocketResponse {
//   data: any;
//   message: string;
//   traceId: string;
//   success: boolean;
// }

// export interface ReactWebSocketRequest {
//   data: any;
//   url: string;
// }

// export const isRequest = (o: any): o is WebSocketRequest =>
//   o.hasOwnProperty('url') === true;

// export const isResponse = (o: any): o is WebSocketResponse =>
//   o.hasOwnProperty('success') === true;

// let globalReady = false;

// export default function createReactConnector(
//   facadeAPI: Map<
//     string,
//     (
//       data: object,
//       request: WebSocketRequest,
//     ) => Promise<Partial<WebSocketResponse>>
//   >,
// ) {
//   // 回调promise集合
//   const callbacks = new Map<
//     string,
//     { resolve: (response: any) => void; reject: (error: any) => void }
//   >();

//   /** 提供挂在监听函数 */
//   const useConnector = (
//     fns: Map<
//       string,
//       (data: object, request: WebSocketRequest) => WebSocketResponse
//     >,
//   ) => {
//     fns.forEach((fn, fnKey) => {
//       // @ts-ignore
//       facadeAPI.set(fnKey, fn);
//     });
//     globalReady = true;
//   };

//   const getHonDomain = (ip: string, port: string) => {
//     const g = new HonLocatorGenerator('_HonMeirinHello_');
//     const honDomain = `${g.generate(`${ip}:${port}`, OutputType.base32)}`;
//     return honDomain;
//   };

//   /** websocket ws://127.0.0.1:xxxx?clientId=chat*/
//   const ws = (function () {
//     const host = isEmpty(pluginParams.get('ip'))
//       ? '127.0.0.1'
//       : pluginParams.get('ip');
//     let server;
//     const hostName = pluginParams.get('honUrl')?'ihon.alipay.com':'hon.alibaba-inc.com'
//     if (pluginParams.get('isCloudIDE') === 'true') {
//       server = new ReconnectingWebSocket(
//         `wss://${getHonDomain(
//           host,
//           pluginParams.get('port'),
//         )}.${hostName}`,
//       );
//     } else {
//       server = new ReconnectingWebSocket(
//         `ws://${host}:${pluginParams.get('port')}?clientId=CHAT`,
//       );
//     }

//     server.addEventListener('open', () => {
//       console.log(`socket 链接建立成功`);
//       if (pluginParams.get('isCloudIDE') === 'true') {
//         const timer = setInterval(() => {
//           if (globalReady) {
//             // 挂载当前channel
//             ws.send('CHAT');
//             clearInterval(timer);
//           }
//         }, 100);
//       }
//     });
//     server.addEventListener('error', (err: any) => {
//       error(`${JSON.stringify(err)}`,null,ErrorScenes.WEB_SOCKET_CONNECT_FAIL)
//       message.error('socket 链接建立失败' + err);
//     });
//     return server;
//   })();

//   /** ws send */
//   const send = (data: any) => {
//     ws.send(JSON.stringify(data));
//   };

//   /** 监听 */
//   ws.addEventListener('message', (e: { data: string }) => {
//     console.log('接受到插件端消息', e);
//     const body = JSON.parse(e.data);
//     // 如果收到的是request，那么说明是发送的请求，那么执行对应的函数
//     if (isRequest(body)) {
//       let current = facadeAPI.get(body.url);

//       if (!current) {
//         send({
//           success: false,
//           traceId: body.traceId,
//           errorMsg: `${body.url} 未定义`,
//         });
//         return;
//       }

//       const fn = current;

//       try {
//         fn(body.data, body).then((result) => {
//           console.log(result);

//           // 执行结果不返回，则直接中止执行
//           if (result === undefined) {
//             return;
//           }

//           // 返回响应结果
//           send({
//             traceId: body.traceId,
//             data: result.data || null,
//             success: result.success ?? true,
//           });
//         });
//       } catch (err: any) {
//         error(`request:${e.data},`,err,ErrorScenes.WEB_SOCKET_HANDLE_REQUEST_FAIL)
//         send({
//           success: false,
//           traceId: body.traceId,
//           data: null,
//           message: err?.message || '执行错误',
//         });
//       }

//       return;
//     }

//     // 如果收到的是 response，那么说明是收到的返回结果，那么检查 callbacks，并结束掉整个 promise
//     if (isResponse(body)) {
//       if (callbacks.has(body.traceId)) {
//         const { success } = body;

//         try {
//           if (success) {
//             callbacks.get(body.traceId)!.resolve(body);
//           } else {
//             callbacks.get(body.traceId)!.reject(body);
//           }
//         } catch (err:any) {
//           error(`response:${e.data},`,err,ErrorScenes.WEB_SOCKET_HANDLE_RESPONSE_FAIL)
//           console.log('err', err);
//         }
//       }
//     }
//   });

//   /**
//    * 生成traceId
//    */
//   function generateTraceId(): string {
//     let timestamp = new Date().getTime();
//     let random = Math.floor(Math.random() * 1000000);
//     return `trace_${timestamp}_${random}`;
//   }

//   /**
//    * 请求函数
//    */
//   const request = (reactRequest: ReactWebSocketRequest) => {
//     let websocketRequest: WebSocketRequest = {
//       data: reactRequest.data,
//       url: reactRequest.url,
//       traceId: generateTraceId(),
//       projectMD5: pluginParams.has('projectMD5')
//         ? pluginParams.get('projectMD5')!!
//         : '',
//     };
//     return new Promise<WebSocketResponse>((resolve, reject) => {
//       callbacks.set(websocketRequest.traceId, { resolve, reject });
//       send(websocketRequest);
//     });
//   };

//   return {
//     useConnector,
//     request,
//   };
// }

// import createReactConnector, {WebSocketResponse } from '@/components/ChatGpt/socketConnector';

// const { request,useConnector } = createReactConnector(
//   new Map<string,(data:any)=>WebSocketResponse>(),
// );

// export const socketListener = useConnector;
// export const websocketClient = request;

export const WebSocketStatus = {
  CONNECTING: "CONNECTING",
  OPEN: "OPEN",
  CLOSING: "CLOSING",
  CLOSED: "CLOSED",
  ERROR: "ERROR"
};

class WebSocketClient {
  constructor(url = "ws://localhost:3020") {
    this.url = url;
    this.ws = null;
    this.messageQueue = [];
    // 用字段记录当前webscoket的状态，用来页面交互
    this.wsState = "";
    this.connect();
    // 记录监听行为
    this.statusChangeCallbacks = [];
    // 记录接口处理函数
    this.apiCallbackFns = {};
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("WebSocket 连接成功");
      this.updateStatus(WebSocketStatus.OPEN);
    };

    this.ws.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        if (response.success && response?.traceId) {
          console.log("websocket收到消息", response);
          this.updateStatus(WebSocketStatus.OPEN);
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
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket 连接错误", error);
      this.updateStatus(WebSocketStatus.ERROR);
    };

    this.ws.onclose = () => {
      console.log("WebSocket 连接关闭");
      this.updateStatus(WebSocketStatus.CLOSED);
    };
  }

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
      // 检查是否链接websocket
      if (!this.ws || this.ws.readyState !== WebSocketStatus.OPEN) {
        reject(new Error("WebSocket 未连接"));
        return;
      }
      const traceId = generateTraceId();
      const message = {
        url,
        request,
        traceId
      };
      this.ws.send(JSON.stringify(message));
    });
  }

  //---------------------------------------------
}

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
