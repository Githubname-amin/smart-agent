import React, { useState, useEffect, useRef } from "react";
import "./index.less";
import { Button, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { CopyOutlined, CloseOutlined } from "@ant-design/icons";
import {
  handleCopyMessage,
  detectIfCode,
  detectLanguage,
  generateTraceId
} from "../../utils";
import {
  sendChatDataTest,
  clearChatDatas,
  userHistoryDataClient,
  sendHTTPChat
} from "../../server/model";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CodeBuffer } from "../../utils/buffer";
import {
  websocketClient,
  WebSocketStatus,
  registerApiCallbackFn
} from "../../server/websocket";
import { pluginParams } from "../../server/websocket";
const Chat = () => {
  const [startPrompt, setStartPrompt] = useState([]); // 是否已经获取到prompt
  const [currentData, setCurrentData] = useState({ traceId: "", message: [] });
  const [isComposing, setIsComposing] = useState(false); // 是否正在对话的状态
  const [inputValue, setInputValue] = useState("");
  // const [inputIsTop, setInputIsTop] = useState(false); //有对话记录的清空下，输入框是否置顶
  const [pastedCodeData, setPastedCodeData] = useState(""); // 粘贴的代码数据
  const [isCollectingCode, setIsCollectingCode] = useState(false); // 是否正在收集代码
  // const [currentCodeBlock, setCurrentCodeBlock] = useState(""); // 当前收集的代码块，每次处理完后清除
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false); // 是否正在加载 prompt 上下文，适用于最初加载和后续添加新代码快

  // 当前对话上下文收集统计到的代码块集合
  const [currentCodeBlockList, setCurrentCodeBlockList] = useState([]);
  const currentCodeBlockListRef = useRef([]);
  const [currentSelectCode, setCurrentSelectCode] = useState({
    traceId: "",
    code: ""
  }); //当前输入框内展示的代码块

  const codeBuffer = useRef(new CodeBuffer(generateTraceId()));

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
      content: inputValue
    };
    setCurrentData((prevData) => ({
      ...prevData,
      message: [...prevData?.message, nowUserMessage]
    }));

    // 创建助手的空消息
    const assistantMessage = {
      role: "assistant",
      content: []
    };
    setCurrentData((prevData) => ({
      ...prevData,
      message: [...prevData.message, assistantMessage]
    }));

    // 已经建立链接，已经录入问题，已经得到prompt，开始请求
    try {
      // const response = await sendMessageTest(inputValue);
      const response = await sendHTTPChat(inputValue);
      console.log("response前端js", response);

      // 用for await 来处理流式响应
      // 使用buffer来处理流式响应
      for await (const chunk of response) {
        const content = chunk.choices[0].delta.content;
        // const result = codeBuffer.current.process(content);
        const result = await codeBuffer.current.processWindow(content);
        if (chunk?.finish_reason === "stop") {
          const result = codeBuffer.current.flush();
          console.log("resultStop", result, content, currentData);
        }
        console.log("result", result, content, currentData);
        if (result) {
          if (result.type === "text") {
            setCurrentData((prevData) => {
              const newMessage = [...prevData.message];
              const lastMessage = newMessage[newMessage.length - 1];
              if (lastMessage.role === "assistant") {
                lastMessage.content.push(result);
              }
              return { ...prevData, message: newMessage };
            });
          }
          if (result.type === "code") {
            // 如果对于当前的这次代码块没有位置,则录入一个空数组,用于渲染页面
            // 这里也可能直接是返回代码,那么没有assistant数据
            setCurrentData((prevData) => {
              const newMessage = [...prevData.message];
              const lastMessage = newMessage[newMessage.length - 1];
              if (
                lastMessage.role === "assistant" &&
                !lastMessage.content.find(
                  (item) =>
                    item.type === "code" &&
                    item.traceId === String(codeBuffer.current.codeTraceId)
                )
              ) {
                lastMessage.content.push({
                  content: "",
                  type: "code",
                  traceId: String(codeBuffer.current.codeTraceId)
                });
              }
              return { ...prevData, message: newMessage }; // 这里需要返回新的状态
            });
            // 处理代码
            console.log(
              "currentCodeBlockListRef",
              currentCodeBlockListRef,
              currentCodeBlockListRef.current[0]?.traceId ===
                String(codeBuffer.current.codeTraceId)
            );
            const traceId = String(codeBuffer.current.codeTraceId);
            const existingBlock = currentCodeBlockListRef.current.find(
              (item) => item.traceId === traceId
            );
            if (existingBlock) {
              // 存在这条代码,更新,在后面加上现在返回的代码
              const currentCode = existingBlock.code;
              const newCode = currentCode + result.content;
              const updateList = currentCodeBlockListRef.current.map((item) =>
                item.traceId === traceId ? { ...item, code: newCode } : item
              );
              currentCodeBlockListRef.current = updateList;
              setCurrentCodeBlockList(updateList);
            } else {
              const newList = [
                {
                  traceId: traceId,
                  code: result.content
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
      { traceId: request.traceId, code: request.data.code }
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
    if (typeof content === "string") {
      return (
        <span className="chat-content-item-content-user-text-content">
          {content}
        </span>
      );
    }
    console.log("查询当前许多数据", content);
    return content.map((item, index) => {
      // debugger;
      if (item.type === "code") {
        return (
          <div
            key={`code-${index}`}
            id={`code-${codeBuffer.current.codeTraceId}`}
            className="code-block"
          >
            <div className="code-block-title">
              <span>{"java"}</span>
              <CopyOutlined
                className="code-block-title-copy"
                onClick={() =>
                  handleCopyMessage(
                    currentCodeBlockList.find(
                      (item) =>
                        item.traceId === String(codeBuffer.current.codeTraceId)
                    )
                  )
                }
              />
            </div>
            <SyntaxHighlighter language={"java"} style={vscDarkPlus}>
              {
                currentCodeBlockList.find(
                  (item) =>
                    item.traceId === String(codeBuffer.current.codeTraceId)
                )?.code
              }
            </SyntaxHighlighter>
          </div>
        );
      } else {
        return <span key={`text-${index}`}>{item.content}</span>;
      }
    });

    // return (
    //   <div id={`code-${codeBuffer.current.codeTraceId}`} className="code-block">
    //     <div className="code-block-title">
    //       <span>{"java"}</span>
    //       <CopyOutlined
    //         className="code-block-title-copy"
    //         onClick={() =>
    //           handleCopyMessage(
    //             codeBlockRef.current[codeBuffer.current.codeTraceId]
    //           )
    //         }
    //       />
    //     </div>
    //     <SyntaxHighlighter language={"java"} style={vscDarkPlus}>
    //       {codeBlockRef.current[codeBuffer.current.codeTraceId]}
    //     </SyntaxHighlighter>
    //   </div>
    // );
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
      clearChatDatas();
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
          <span className="chat-input-component-title-text">
            <span>
              + Add Context
              {isLoadingPrompt ? "加载中..." : ""}
            </span>

            {currentSelectCode?.traceId && (
              <CopyOutlined
                onClick={() => {
                  handleCopyMessage(currentSelectCode?.traceId);
                }}
              />
            )}
          </span>
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
            <div className="chat-input-component-title-traceId-code">
              <SyntaxHighlighter language={"java"} style={vscDarkPlus}>
                {currentSelectCode?.code}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
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
            {isComposing ? "停止" : "发送"}
          </Button>
        </div>
      </div>
    );
  };

  // 代码展示组件
  const messageRender = (msgItem) => {
    // 处理返回体中的代码片段
    if (msgItem.role === "assistant") {
      const codeBlock = msgItem.content.match(/```[\s\S]*```/g);
      if (codeBlock) {
        return codeBlock.map((code) => {
          return (
            <SyntaxHighlighter language="javascript">{code}</SyntaxHighlighter>
          );
        });
      }
    }
    return msgItem.content;
  };
  return (
    <div className="chat-box" style={{ margin: "10px" }}>
      {/* <div
        onClick={() => {
          websocketClient.onClose();
        }}
      >
        测试按钮
      </div>
      <div
        onClick={() => {
          websocketClient.onReconnect();
        }}
      >
        重连按钮
      </div> */}
      {false ? (
        <div>加载中...</div>
      ) : (
        <div className="chat-container">
          <div className="chat-content">
            <div className="chat-content-item">
              {!currentData?.message?.length ? (
                <div>{InputComponent("top")}</div>
              ) : (
                <div className="chat-content-item-content">
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
                            {/* <ReactMarkdown>{messageRender(item)}</ReactMarkdown> */}
                            {/* <ReactMarkdown>{item.content}</ReactMarkdown> */}
                            {renderMessageContent(item.content)}
                            {/* <button onClick={() => console.log(item)}>
                            点我
                          </button> */}
                          </div>
                        </div>
                        <div className="chat-content-item-content-time">
                          {new Date().toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="chat-content-item-content-empty">
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
