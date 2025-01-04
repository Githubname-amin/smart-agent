import React, { useState, useEffect, useRef } from "react";
import "./index.less";
import { Button, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import {
  CopyOutlined,
  CloseOutlined,
  DownOutlined,
  UpOutlined
} from "@ant-design/icons";
import { handleCopyMessage, detectIfCode } from "../../utils";
import { userHistoryDataClient, sendHTTPChat } from "../../server/model";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import { generateTraceId } from "../../utils";

import { CodeBuffer } from "../../utils/buffer";
import {
  websocketClient,
  WebSocketStatus,
  registerApiCallbackFn
} from "../../server/websocket";
const Chat = () => {
  const [currentData, setCurrentData] = useState({ traceId: "", message: [] });
  const [isComposing, setIsComposing] = useState(false); // 是否正在对话的状态
  const [inputValue, setInputValue] = useState("");
  const [pastedCodeData, setPastedCodeData] = useState(""); // 粘贴的代码数据
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false); // 是否正在加载 prompt 上下文，适用于最初加载和后续添加新代码快

  // 当前对话上下文收集统计到的代码块集合
  const [currentCodeBlockList, setCurrentCodeBlockList] = useState([]);
  const currentCodeBlockListRef = useRef([]);

  // 当前对话上下文收集的文本块
  const currentMarkdownListRef = useRef([]);
  const [currentMarkdownString, setCurrentMarkdownString] = useState([]);

  // 输入框相关
  const [currentSelectCode, setCurrentSelectCode] = useState({
    traceId: "",
    code: ""
  }); //当前输入框内展示的代码块
  const [isExpanded, setIsExpanded] = useState(false);

  // 其他工具
  const codeBuffer = useRef(new CodeBuffer(generateTraceId()));
  const historyChatDatas = useRef("");

  // --------------------------------------------------------
  // 输入框相关的函数
  // 删除当前代码对话上下文所需要的参数
  const deleteCurrentSelectCode = (traceId) => {
    setCurrentSelectCode((prevData) =>
      prevData.filter((item) => item.traceId !== traceId)
    );
  };

  // 切换当前查询代码的展示
  const handleChangeSelectCodeShow = (item) => {
    console.log("handleChangeSelectCodeShow", item);
    if (item?.traceId === currentSelectCode?.traceId) {
      setCurrentSelectCode(null);
    } else {
      setCurrentSelectCode(item);
    }
  };

  // ------------------------------------------------
  const handleOnPaste = (e) => {
    // 阻止默认的换行行为
    e.preventDefault();

    // 截停输入框粘贴代码和图片
    const clipboardData = e.clipboardData || window.clipboardData;
    if (clipboardData) {
      const pastedData = clipboardData.getData("text");
      // console.log("clipboardData", clipboardData, pastedData);
      const isCode = detectIfCode(pastedData);
      if (isCode) {
        const formattedCode = `\`\`\`\n${pastedData}\n\`\`\``;
        setPastedCodeData(formattedCode);
      } else {
        // 如果不是，则正常将内容粘贴到光标处
        const newValue =
          inputValue.substring(0, e.target.selectionStart) +
          pastedData +
          inputValue.substring(e.target.selectionEnd);
        setInputValue(newValue);
      }
    }
  };

  //--------------------------------------------------
  // 页面最初的webscoket连接相关

  // 这个方法最早执行，只执行一次。后续则是其他接口传递 prompt，然后修改那个数组
  // 在链接后传递基础上下文，一般最初为超级长的上下文描述
  const handleRequestPrompt = (ws, request) => {
    console.log("handleRequestPrompt前端页面", ws, request);
    setIsLoadingPrompt(true);
    if (request.success) {
      // 判断传递过来的信息是怎样的？超长字符串？还是代码块？
      // 需要统一处理的函数(用来处理返回报文,然后将其写入到自定义的类中)

      // 录入到上下文信息中
      const startUserChatData = {
        role: "user",
        content: request?.data?.userPrompt
      };
      const startAssistantChatData = {
        role: "system",
        content: request?.data?.systemPrompt || "You are a helpful assistant."
      };
      // 初始化上下文
      userHistoryDataClient.initChatDatas(
        [startAssistantChatData, startUserChatData],
        request?.traceId
      );
      currentCodeBlockListRef.current = [
        { traceId: request?.traceId, code: request?.data?.code }
      ];
      setIsLoadingPrompt(false);
    }
  };

  // 和模型对话
  const handleSendMessage = async () => {
    if (isComposing) return;
    // 发送信息后or初次对话的时候触发当前请求
    setIsComposing(true);

    // 前端校验结束，那么录入信息
    const nowUserMessage = {
      role: "user",
      content: inputValue,
      time: new Date().toLocaleTimeString()
    };
    setCurrentData((prevData) => ({
      ...prevData,
      message: [...prevData?.message, nowUserMessage]
    }));

    // 创建助手的空消息
    const assistantMessage = {
      role: "assistant",
      content: [],
      time: new Date().toLocaleTimeString()
    };
    setCurrentData((prevData) => ({
      ...prevData,
      message: [...prevData.message, assistantMessage]
    }));

    // 已经建立链接，已经录入问题，已经得到prompt，开始请求
    try {
      // const response = await sendMessageTest(inputValue);
      const response = await sendHTTPChat(inputValue);
      // console.log("response前端js", response);

      // 用for await 来处理流式响应
      // 使用buffer来处理流式响应
      for await (const chunk of response) {
        const content = chunk.choices[0].delta.content;
        // 需要保存一份纯粹的字符串形式，后续作为chat应答发送给下一次对话
        historyChatDatas.current += content;
        const result = await codeBuffer.current.processWindow(content);
        if (chunk?.choices[0]?.finish_reason === "stop") {
          const resultAll = codeBuffer.current.flush();
          userHistoryDataClient.addChatData({
            role: "assistant",
            content: historyChatDatas.current
          });
          console.log(
            "resultStop",
            result,
            resultAll,
            content,
            currentData
            // userHistoryDataClient
            // historyChatDatas
          );
          // debugger;
        }
        // console.log("result", result, content, currentData);
        if (result) {
          if (result.type === "text") {
            const nowTextTraceId = result.traceId;
            setCurrentData((prevData) => {
              const newMessage = [...prevData.message];
              const lastMessage = newMessage[newMessage.length - 1];
              if (
                lastMessage.role === "assistant" &&
                !lastMessage.content.find(
                  (item) =>
                    item.type === "text" && item.traceId === nowTextTraceId
                )
              ) {
                lastMessage.content.push({
                  type: "text",
                  traceId: nowTextTraceId,
                  content: ""
                });
              }
              return { ...prevData, message: newMessage };
            });

            const existText = currentMarkdownListRef.current.find(
              (item) => item.traceId === nowTextTraceId
            );
            if (existText) {
              const currentText = existText.text;
              const newText = currentText + result.text;
              const newMessage = currentMarkdownListRef.current.map((item) =>
                item.traceId === nowTextTraceId
                  ? { ...item, text: newText }
                  : item
              );
              currentMarkdownListRef.current = newMessage;
              setCurrentMarkdownString(newMessage);
            } else {
              // 初次录入
              const newList = [
                ...currentMarkdownListRef.current,
                {
                  traceId: nowTextTraceId,
                  text: result.text
                }
              ];
              currentMarkdownListRef.current = newList;
              setCurrentMarkdownString(newList);
            }
          }
          if (result.type === "code") {
            const nowTraceId = result.traceId;
            // 如果对于当前的这次代码块没有位置,则录入一个空数组,用于渲染页面
            // 这里也可能直接是返回代码,那么没有assistant数据
            setCurrentData((prevData) => {
              const newMessage = [...prevData.message];
              const lastMessage = newMessage[newMessage.length - 1];
              if (
                lastMessage.role === "assistant" &&
                !lastMessage.content.find(
                  (item) => item.type === "code" && item.traceId === nowTraceId
                )
              ) {
                lastMessage.content.push({
                  type: "code",
                  content: "",
                  traceId: nowTraceId
                });
              }
              return { ...prevData, message: newMessage }; // 这里需要返回新的状态
            });
            // 处理代码
            // console.log(
            //   "currentCodeBlockListRef",
            //   currentCodeBlockListRef,
            //   currentCodeBlockListRef.current[0]?.traceId === result.traceId
            // );

            const existingBlock = currentCodeBlockListRef.current.find(
              (item) => item.traceId === nowTraceId
            );
            if (existingBlock) {
              // 存在这条代码,更新,在后面加上现在返回的代码
              const currentCode = existingBlock.code;
              const newCode = currentCode + result.code;
              const updateList = currentCodeBlockListRef.current.map((item) =>
                item.traceId === nowTraceId ? { ...item, code: newCode } : item
              );
              currentCodeBlockListRef.current = updateList;
              setCurrentCodeBlockList(updateList);
            } else {
              // 如果是其他代码块，需要保留之前代码块
              const newList = [
                ...currentCodeBlockListRef.current,
                {
                  traceId: nowTraceId,
                  code: result.code,
                  language: result.language
                }
              ];
              currentCodeBlockListRef.current = newList;
              setCurrentCodeBlockList(newList);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setInputValue("");
      setIsComposing(false);
    }

    // 假设已经获取到了数据

    // 判断请求是否成功

    // 成功后判断是否存在上下文
    // setCurrentData(data);
  };

  // 处理服务端传递代码的逻辑
  const handleSelectCode = (ws, request) => {
    console.log("handleSelectCode前端页面", ws, request);
    // 获取到代码后，插入到输入框上层的代码展示区域
    currentCodeBlockListRef.current = [
      {
        traceId: request.traceId,
        code: request.data.code,
        language: request.data.language
      }
    ];
  };

  // 插件选中一段代码，传递给前端，让前端展示
  const handleInsertCodeToEditor = (ws, request) => {
    // console.log("handleInsertCodeToEditor前端页面", ws, request);
  };

  // --------------------------------------------------------
  // 组件处理相关
  // 处理渲染问题
  const renderMessageContent = (content) => {
    // console.log(
    //   "content",
    //   currentData,
    //   content,
    //   currentCodeBlockList,
    //   currentMarkdownString
    // );
    if (typeof content === "string") {
      return (
        <span className="chat-content-item-content-user-text-content">
          {/* 这里是对用户字符串进行展示 */}
          {content}
        </span>
      );
    }
    return content.map((item, index) => {
      if (item.type === "code") {
        return (
          <div
            key={`code-${index}`}
            id={`code-${item.traceId}`}
            className="code-block"
          >
            <div className="code-block-title">
              <span>
                {
                  currentCodeBlockList.find(
                    (codeBlockItem) => codeBlockItem.traceId === item.traceId
                  )?.language
                }
              </span>
              <CopyOutlined
                className="code-block-title-copy"
                onClick={() =>
                  handleCopyMessage(
                    currentCodeBlockList.find(
                      (codeBlockItem) => codeBlockItem.traceId === item.traceId
                    )
                  )
                }
              />
            </div>
            <SyntaxHighlighter
              language={
                currentCodeBlockList.find(
                  (codeBlockItem) => codeBlockItem.traceId === item.traceId
                )?.language
              }
              style={vscDarkPlus}
            >
              {
                currentCodeBlockList.find(
                  (codeBlockItem) => codeBlockItem.traceId === item.traceId
                )?.code
              }
            </SyntaxHighlighter>
          </div>
        );
      } else {
        return (
          <span key={`text-${item.traceId}`}>
            <ReactMarkdown>
              {
                currentMarkdownString.find(
                  (markdownStringItem) =>
                    markdownStringItem.traceId === item.traceId
                )?.text
              }
            </ReactMarkdown>
          </span>
        );
      }
    });
  };

  useEffect(() => {
    console.log("useEffect", window.intellij);

    // 监听服务端传递代码的动作
    registerApiCallbackFn("chat/prompt", handleRequestPrompt);
    registerApiCallbackFn("chat/select_code", handleSelectCode);
    registerApiCallbackFn(
      "chat/insert_code_to_input",
      handleInsertCodeToEditor
    );

    // 添加状态监听，所有状态变更都会走这个函数
    const handleStatusChange = (status) => {
      console.log("handleStatusChange11", status);
      // 当 WebSocket 连接成功时才执行 fetchData
      if (status === WebSocketStatus.OPEN) {
      } else if (status === WebSocketStatus.ERROR) {
        // 弹出弹窗
        message.error("WebSocket 连接失败");
        return;
      }
    };
    websocketClient.onStatusChange(handleStatusChange);
    websocketClient.init();

    return () => {
      // 对话结束的时候，清空messages对话上下文
      const result = userHistoryDataClient.clearAllUserHistoryData();
      console.log("当前用户所有的对话数据", result);
      // 移除状态监听
      websocketClient.removeStatusChange(handleStatusChange);
    };
  }, []);

  //   顶部输入框组件
  const InputComponent = (type) => {
    const isTop = type === "top";
    return (
      <div
        className={`chat-input-component ${
          isTop ? "" : "chat-input-component-bottom"
        }`}
      >
        <div className="chat-input-component-title">
          <div className="chat-input-component-title-text-box">
            <div className="chat-input-component-title-text">
              <div>
                <span style={{ margin: "0 2px" }}>+</span> Add Context
              </div>
              <div>{isLoadingPrompt ? "加载中..." : ""}</div>
            </div>

            {currentSelectCode?.traceId && (
              <CopyOutlined
                onClick={() => {
                  handleCopyMessage(currentSelectCode?.traceId);
                }}
              />
            )}
          </div>
          <div className="chat-input-component-title-traceId-box">
            {currentCodeBlockListRef.current.length > 0 &&
              currentCodeBlockListRef.current.map((item, index) => {
                return (
                  <div
                    className={`chat-input-component-title-traceId ${
                      currentSelectCode?.traceId === item?.traceId
                        ? "chat-input-component-title-traceId-active"
                        : ""
                    }`}
                    // key={item?.traceId}
                    key={index}
                  >
                    <span
                      onClick={() => {
                        handleChangeSelectCodeShow(item);
                      }}
                    >
                      {item?.traceId}
                    </span>
                    <span
                      style={{ cursor: "pointer", marginLeft: "5px" }}
                      onClick={() => {
                        deleteCurrentSelectCode(item?.traceId);
                      }}
                    >
                      <CloseOutlined />
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
        <div>
          {/* 展示当前选中任务的代码 */}
          {currentSelectCode && currentSelectCode?.code && (
            <div className="chat-input-component-title-code-box">
              <div
                className="chat-input-component-title-traceId-code"
                style={{
                  maxHeight: isExpanded ? "none" : "200px"
                }}
              >
                <SyntaxHighlighter
                  language={currentSelectCode?.language}
                  style={vscDarkPlus}
                >
                  {currentSelectCode?.code}
                </SyntaxHighlighter>
              </div>
              {!isExpanded && (
                <div
                  onClick={() => setIsExpanded(true)}
                  className="closeIconShow"
                  style={{}}
                >
                  <DownOutlined />
                </div>
              )}
              {isExpanded && (
                <div
                  onClick={() => setIsExpanded(false)}
                  className="closeExpanded"
                >
                  <UpOutlined />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="chat-footer-action-box">
          <TextArea
            autoSize={{ minRows: isTop ? 3 : 2, maxRows: 6 }}
            className="chat-input-textarea"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            // onCompositionStart={() => setIsComposing(true)}
            // onCompositionEnd={() => setIsComposing(false)}
            onPaste={handleOnPaste}
            onPressEnter={(e) => {
              if (e.shiftKey) {
                // 如果按下了 Shift 键，不触发发送
                return;
              }
              handleSendMessage(isTop);
            }}
            placeholder="输入消息按Enter发送，Shift+Enter换行"
            disabled={isComposing}
          />
          <div className="chat-action-box">
            <div></div>
            <Button
              className="chat-submit-btn"
              onClick={() => handleSendMessage(isTop)}
            >
              {isComposing ? "停止" : "发送 "}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="chat-box">
      {false ? (
        <div>加载中...</div>
      ) : (
        <div className="chat-container" style={{ margin: "10px" }}>
          <div className="chat-content">
            <div className="chat-content-item">
              {!currentData?.message?.length ? (
                <div>{InputComponent("top")}</div>
              ) : (
                <div
                  className="chat-content-item-content"
                  style={{ paddingBottom: isExpanded ? 600 : 300 }}
                >
                  {currentData?.message.map((item, index) => (
                    <div key={index}>
                      <div
                        className={`inputContainer ${
                          item.role === "user" ? "user" : "assistant"
                        }`}
                      >
                        <div className="chat-content-item-content-user-text-copy">
                          <CopyOutlined
                            onClick={() => handleCopyMessage(item)}
                          />
                        </div>
                        <div className="chat-content-item-content-user-text">
                          <div className="chat-content-item-content-user-text-content">
                            {renderMessageContent(item.content)}
                          </div>
                        </div>
                        <div className="chat-content-item-content-time">
                          {item.time ? item.time : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="chat-content-item-content-empty">
                    {/* 需要处理粘贴板 */}
                    {pastedCodeData}
                    {InputComponent("bottom")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
