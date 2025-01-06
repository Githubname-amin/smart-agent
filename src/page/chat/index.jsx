import React, { useState, useEffect, useRef } from "react";
import "./index.less";
import { Button, message, Dropdown, Upload } from "antd";
import TextArea from "antd/es/input/TextArea";
import {
  CopyOutlined,
  CloseOutlined,
  DownOutlined,
  UpOutlined,
  QuestionOutlined,
  PictureOutlined
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
  //当前输入框内展示的选中的代码块
  const [currentSelectCode, setCurrentSelectCode] = useState();
  const [currentInputContextList, setCurrentInputContextList] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentModel, setCurrentModel] = useState("qwen-turbo");
  // 其他工具
  const codeBuffer = useRef(new CodeBuffer(generateTraceId()));
  const historyChatDatas = useRef("");

  const modelItems = [
    {
      key: "qwen-turbo",
      label: "qwen-turbo",
      value: "qwen-turbo",
      onClick: () => setCurrentModel("qwen-turbo")
    },
    {
      key: "qwen-plus",
      label: "qwen-plus",
      value: "qwen-plus",
      onClick: () => setCurrentModel("qwen-plus")
    },
    {
      key: "qwen-mini",
      label: "qwen-mini",
      value: "qwen-mini",
      onClick: () => setCurrentModel("qwen-mini")
    },
    {
      key: "ollama",
      label: "ollama",
      value: "ollama",
      onClick: () => setCurrentModel("ollama")
    }
  ];

  // --------------------------------------------------------
  // 输入框相关的函数
  // 删除当前代码对话上下文所需要的参数
  const deleteCurrentSelectCode = (traceId) => {
    setCurrentSelectCode({});
    setCurrentInputContextList((prevData) => {
      const newData = prevData.filter((item) => item.traceId !== traceId);
      if (newData.length === 0) {
        return [];
      }
      return newData;
    });
  };

  // 切换当前查询代码的展示
  const handleChangeSelectCodeShow = (item) => {
    console.log("handleChangeSelectCodeShow", item);
    if (item?.traceId === currentSelectCode?.traceId) {
      setCurrentSelectCode({});
    } else {
      setCurrentSelectCode(item);
      // setCurrentInputContextList(item);
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
        content: "这是一些基础对话上下文信息" + request?.data?.userPrompt
      };
      const startAssistantChatData = {
        role: "system",
        content:
          "这是一些基础设定信息" +
          (request?.data?.systemPrompt || "你是一个出色的程序员.")
      };
      // 初始化上下文
      userHistoryDataClient.initChatDatas(
        [startAssistantChatData, startUserChatData],
        request?.traceId
      );
      // 这是之前测试的写法
      currentCodeBlockListRef.current = [
        { traceId: request?.traceId, code: request?.data?.code }
      ];
      // 设置当前请求到的prompt进入输入框上下文，需要联调后检查是否这个意思
      // setCurrentInputContextList([
      //   {
      //     traceId: request?.traceId,
      //     type: "prompt",
      //     role: "user",
      //     content: request?.data?.userPrompt,
      //     fileName: "userPrompt"
      //   },
      //   {
      //     traceId: request?.traceId,
      //     type: "prompt",
      //     role: "system",
      //     content: request?.data?.systemPrompt,
      //     fileName: "systemPrompt"
      //   }
      // ]);
      setIsLoadingPrompt(false);

      // 前端发送一个请求回后端
      ws.send({
        type: "chatPromptResponseSuccess",
        success: true,
        tracerId: "xxxx",
        data: {
          answer: "这是测试的返回报文"
        }
      });
    }
  };

  // 处理当前对话上下文，产出可以给请求使用的上下文
  const actionContextFn = (inputValue) => {
    const currentChatContext = [];
    const nowUserMessage = {
      role: "user",
      content: ""
    };
    if (currentInputContextList.length > 0) {
      currentInputContextList.forEach((item) => {
        if (item.type === "prompt") {
          // 当前这样设计与userHistoryDataClient.initChatDatas功能冲突，因此先不做处理。问题出在和后端的业务理解当前不确定
          // currentChatContext.push({
          //   type: "promptAdd",
          //   role: "user",
          //   content: "这些是一些基础背景信息：" + item.content
          // });
        } else if (item.type === "code" || item.type === "text") {
          currentChatContext.push({
            type: "activelyAdd",
            role: "user",
            content: "请注意你之前提到的这些内容：" + item.content
          });
        }
      });

      // 按照基础prompt、用户选择的信息、用户输入的问题三者顺序排列，将本次用户的问题整合成一个字符串
      nowUserMessage.content =
        "这些是你上方提到的信息，请在回答的时候注意语境" +
        currentInputContextList.map((item) => item.content).join("\n");
    }
    nowUserMessage.content += "我现在的问题是：" + inputValue;
    return nowUserMessage;
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
      // 准备本次对话需要的上下文
      const nowChatData = actionContextFn(inputValue);
      userHistoryDataClient.addChatData(nowChatData);
      const response = await sendHTTPChat({ model: currentModel });
      console.log("response前端js", response, nowChatData);

      // 用for await 来处理流式响应
      // 使用buffer来处理流式响应
      for await (const chunk of response) {
        const content = chunk.content;
        // 需要保存一份纯粹的字符串形式，后续作为chat应答发送给下一次对话
        historyChatDatas.current += content;
        const result = await codeBuffer.current.processWindow(content);
        if (chunk?.finish_reason) {
          const resultAll = codeBuffer.current.flush();
          userHistoryDataClient.addChatData({
            // type: "requestAdd",
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

  // 插件在idea选中一段代码，传递给前端，让前端展示
  const handleInsertCodeToEditor = (ws, request) => {
    // console.log("handleInsertCodeToEditor前端页面", ws, request);

    if (request.success) {
      // 成功后，需要将代码插入到输入框中

      // 前端发送一个请求回后端
      if (true) {
        ws.send({
          type: "insertCodeToEditorResponseSuccess",
          success: true,
          tracerId: "xxxx"
        });
      }
    }
  };

  // --------------------------------------------------------
  // 组件处理相关

  // 处理当前段落文案or代码插入到聊天框的逻辑
  const handleQuestionToInput = (item, type) => {
    if (
      currentInputContextList.find(
        (contextItem) => contextItem.traceId === item.traceId
      )
    ) {
      return;
    }
    const nowQuestion = {
      traceId: item.traceId,
      type: type,
      content: type === "code" ? item.code : item.text,
      language: type === "code" ? item.language : "",
      // 为后续准备，如果有文件名称，则展示文件名称。如果没有，则是文本
      // 展示文本的一小部分文案，然后...表示更多
      fileName:
        type === "code" ? item.fileName ?? null : item.text.slice(0, 10) + "..."
    };
    setCurrentInputContextList((prevData) => [...prevData, nowQuestion]);
  };

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
        <>
          <span className="chat-content-item-content-user-text-content">
            {/* 这里是对用户字符串进行展示 */}
            {content}
          </span>
          <div className="chat-content-item-content-user-text-copy-title">
            <CopyOutlined onClick={() => handleCopyMessage(content)} />
          </div>
        </>
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
              <span className="code-block-title-copy">
                <QuestionOutlined
                  style={{ marginRight: "5px" }}
                  onClick={() =>
                    handleQuestionToInput(
                      currentCodeBlockList.find(
                        (codeBlockItem) =>
                          codeBlockItem.traceId === item.traceId
                      ),
                      "code"
                    )
                  }
                />
                <CopyOutlined
                  onClick={() =>
                    handleCopyMessage(
                      currentCodeBlockList.find(
                        (codeBlockItem) =>
                          codeBlockItem.traceId === item.traceId
                      )
                    )
                  }
                />
              </span>
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
          <span
            key={`text-${item.traceId}`}
            className="chat-content-item-content-text-content"
          >
            <ReactMarkdown>
              {
                currentMarkdownString.find(
                  (markdownStringItem) =>
                    markdownStringItem.traceId === item.traceId
                )?.text
              }
            </ReactMarkdown>
            <div className="chat-content-item-content-user-text-copy">
              <QuestionOutlined
                style={{ marginRight: "5px" }}
                onClick={() =>
                  handleQuestionToInput(
                    currentMarkdownString.find(
                      (markdownStringItem) =>
                        markdownStringItem.traceId === item.traceId
                    )
                  )
                }
              />
              <CopyOutlined
                onClick={() =>
                  handleCopyMessage(
                    currentMarkdownString.find(
                      (markdownStringItem) =>
                        markdownStringItem.traceId === item.traceId
                    )?.text
                  )
                }
              />
            </div>
          </span>
        );
      }
    });
  };

  // 处理图片上传(复制粘贴通用)
  const handleUpload = (file) => {
    console.log("handleUpload", file);
    message.warning("开发中~");
    // try {
    //   const isImage = file.type.startsWith("image/");
    //   if (!isImage) {
    //     message.error("只能上传图片");
    //     return;
    //   }
    //   // 对图片进行大小限制
    //   const maxSize = 2 * 1024 * 1024; // 2MB
    //   if (file.size > maxSize) {
    //     message.error("图片大小不能超过2MB");
    //     return;
    //   }
    //   // 将图片文件转化成base64格式
    //   const reader = new FileReader();
    //   reader.readAsDataURL(file);
    //   reader.onload = () => {
    //     const imageData = reader.result;
    //     console.log("imageData", imageData);
    //   };
    // } catch (error) {
    //   console.error("Error uploading image:", error);
    // }
  };

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
            {currentInputContextList.length > 0 &&
              currentInputContextList.map((item, index) => {
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
                      {item?.fileName ?? item?.traceId}
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
          {currentSelectCode && currentSelectCode?.content && (
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
                  {currentSelectCode?.content}
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
            <div className="chat-action-box-model">
              <Dropdown
                menu={{
                  items: modelItems
                }}
              >
                <div className="chat-action-box-model-model">
                  <DownOutlined style={{ marginRight: "4px" }} />
                  {currentModel}
                </div>
              </Dropdown>
              <Upload
                beforeUpload={handleUpload}
                showUploadList={false}
                accept="image/*"
              >
                <div className="chat-action-box-model-image">
                  <PictureOutlined style={{ marginRight: "4px" }} />
                  image
                </div>
              </Upload>
            </div>
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
                        {/* <div className="chat-content-item-content-user-text-copy">
                          <CopyOutlined
                            onClick={() => handleCopyMessage(item)}
                          />
                        </div> */}
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
