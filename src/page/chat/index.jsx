import React, { useState, useEffect, useRef } from "react";
import "./index.less";
import ReactMarkdown from "react-markdown";
import { Button, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { CopyOutlined, CloseOutlined } from "@ant-design/icons";
import { handleCopyMessage, detectIfCode, detectLanguage } from "../../utils";
import {
  sendMessageTest,
  initMessage,
  clearMessages,
  nowUserActionMessageClient,
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
  const [currentCodeBlock, setCurrentCodeBlock] = useState({
    language: "javascript",
    content: ""
  }); // 当前收集的代码块，每次处理完后清除
  const [isPageLoading, setIsPageLoading] = useState(); // 页面是否正在加载

  // 当前对话上下文收集统计到的代码块集合
  const [currentCodeBlockList, setCurrentCodeBlockList] = useState([]);
  const [currentSelectCode, setCurrentSelectCode] = useState({
    traceId: "",
    code: ""
  }); //当前输入框内展示的代码块

  const codeBuffer = useRef(new CodeBuffer());

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

  // 页面最初的webscoket连接相关
  // 关联websocket，与后端建立链接，然后开始对话
  const fetchData = async (nowWsStatus) => {
    // 建立websocket链接，检查当前webscoket链接状态
    if (nowWsStatus === WebSocketStatus.OPEN) {
      // 建立成功，获取到当前的prompt和traceId，用来建立上下文环境
      if (true) {
        // mock传过来的数据
        // const assMessages = [
        //   { role: "system", content: "You are a helpful assistant." },
        //   { role: "user", content: "请用java实现一段两数只和，只需要输出代码" }
        // ];
        // initMessage(assMessages);

        // 请求获取到prompt和traceId
        // 最初这里的message并不确定是否要展示。
        setCurrentData({
          traceId: "123",
          message: []
        });
        // 如果初次拉起来的时候需要展示代码
        if (false) {
          // 录入需要展示的代码块
        }
        //
      }

      // 开始对话,这里是首次加载，基于后端已经分析出prompt的前提下。先写入一些数据在页面上，为对话做准备
      //TODO: 如果检查到后端有传递prompt，则需要录入到上下文信息中

      // 检查当前上下文中是否包括了所有已有的traceId相关的代码
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
        const result = codeBuffer.current.process(content);
        console.log("result", result, content);
        if (result) {
          setCurrentData((prevData) => {
            const newMessage = [...prevData.message];
            const lastMessage = newMessage[newMessage.length - 1];
            if (lastMessage.role === "assistant") {
              lastMessage.content.push(result);
            }
            return { ...prevData, message: newMessage };
          });
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

  // 这个方法最早执行，只执行一次。后续则是其他接口传递 prompt，然后修改那个数组
  // 在链接后传递基础上下文
  const handleRequestPrompt = (ws, request) => {
    console.log("handleRequestPrompt前端页面", ws, request);
    if (request.success) {
      // 录入到上下文信息中
      const startUserMessage = {
        role: "user",
        content: request?.data?.userPrompt
      };
      const startAssistantMessage = {
        role: "system",
        content: request?.data?.systemPrompt || "You are a helpful assistant."
      };
      // 初始化上下文
      nowUserActionMessageClient.initMessages(
        [startAssistantMessage, startUserMessage],
        request?.traceId
      );
      setCurrentCodeBlockList((prevData) => [
        ...prevData,
        { traceId: request?.traceId, code: request?.data?.code }
      ]);
    }
  };

  // 处理服务端传递代码的逻辑
  const handleSelectCode = (ws, request) => {
    console.log("handleSelectCode前端页面", ws, request);
    // 获取到代码后，插入到输入框上层的代码展示区域
    setCurrentCodeBlockList((prevData) => [
      ...prevData,
      { traceId: request.traceId, code: request.data.code }
    ]);
  };

  // 前端传递一段代码给后端
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
    return content.map((item, index) => {
      if (item.type === "code") {
        return (
          <div key={`code-${index}`} className="code-block">
            <div className="code-block-title">
              <span>{item.language}</span>
              <CopyOutlined
                className="code-block-title-copy"
                onClick={() => handleCopyMessage(item)}
              />
            </div>
            <SyntaxHighlighter language={item.language} style={vscDarkPlus}>
              {item.content}
            </SyntaxHighlighter>
          </div>
        );
      } else {
        return <span key={`text-${index}`}>{item.content}</span>;
      }
    });
  };

  useEffect(() => {
    setIsPageLoading(true);
    console.log("pluginParams", pluginParams, window.location);
    // 添加状态监听
    const handleStatusChange = (status) => {
      console.log("handleStatusChange11", status);
      // 当 WebSocket 连接成功时才执行 fetchData
      if (status === WebSocketStatus.OPEN) {
        fetchData(status);
        setIsPageLoading(false);
      } else if (status === WebSocketStatus.ERROR) {
        // 弹出弹窗
        message.error("WebSocket 连接失败");
        return;
      }
    };
    websocketClient.onStatusChange(handleStatusChange);
    // 监听服务端传递代码的动作
    registerApiCallbackFn("/chat/prompt", handleRequestPrompt);
    registerApiCallbackFn("/chat/selectCode", handleSelectCode);
    registerApiCallbackFn("/chat/insertCodeToEditor", handleInsertCodeToEditor);
    // fetchData();
    return () => {
      // 对话结束的时候，清空messages对话上下文
      clearMessages();
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
            当前文件跟踪码：{currentSelectCode?.traceId}
            {currentSelectCode?.traceId && (
              <CopyOutlined
                onClick={() => {
                  handleCopyMessage(currentSelectCode?.traceId);
                }}
              />
            )}
          </span>
          <div className="chat-input-component-title-traceId-box">
            {currentCodeBlockList.length > 0 &&
              currentCodeBlockList.map((item, index) => {
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
      <div
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
      </div>
      {isPageLoading ? (
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
