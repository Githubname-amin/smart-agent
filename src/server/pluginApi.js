import { WebsocketResponse,websocketClient } from "./websocket";
  
/**
 * 前端选中一段代码，传递给服务端，插入到idea的文件中
 * @param {*} params 
 * @returns 
 */
export async function insertCode(params={
    code : ""
}){
    return websocketClient.request(
        url = "chat/insert_code",
        data = params
    )
}

/**
 * 查询目录集合
 * @param {*} params 
 * @returns 
 */
export async function queryDirectories(params = {
    contextTraceId:""
}
){
    return websocketClient.request(
        url = "chat/query_directories",
        data = params
    )
}

/**
 * 插入到新文件中
 * @param {*} params 
 * @returns 
 */
export async function insertFile(params={
    contextTraceId:"",
    code:"",
    path:"",
    fileName:""
}){
    return websocketClient.request(
        url = "chat/insert_file",
        data = params
    )
}