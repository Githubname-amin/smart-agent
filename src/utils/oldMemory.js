// import { isEmpty } from '@/utils/global-utils';
// import HonLocatorGenerator, { OutputType } from '@alipay/hon-locator-generator';
// import { message } from 'antd';
// import ReconnectingWebSocket from 'reconnecting-websocket';
// import { ErrorScenes } from './common/LogUtil';
// import { error } from './common/LogUtil';

// function getUrlParams(url: string): Map<string, string> {
//   const searchParams = new URLSearchParams(url);
//   const params = new Map<string, string>();
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





