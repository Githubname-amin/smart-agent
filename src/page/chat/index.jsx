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
import {
  userHistoryDataClient,
  sendHTTPChat,
  stopCurrentChat
} from "../../server/model";
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
  const isComposingRef = useRef(false);
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
  const handleRequestPrompt = (
    request = {
      traceId: "",
      data: {
        userPrompt: "",
        systemPrompt: "你是一个出色的程序员."
      }
    }
  ) => {
    setIsLoadingPrompt(true);
    if (request.success) {
      // 判断传递过来的信息是怎样的？超长字符串？还是代码块？
      // 需要统一处理的函数(用来处理返回报文,然后将其写入到自定义的类中)

      // 录入到上下文信息中
      const startUserChatData = {
        role: "user",
        content: request.data.userPrompt
      };
      const startAssistantChatData = {
        role: "system",
        content: request.data.systemPrompt
      };
      // 初始化上下文
      userHistoryDataClient.initChatDatas(
        [startAssistantChatData, startUserChatData],
        request?.traceId
      );
      // 这是之前测试的写法
      currentCodeBlockListRef.current = [
        { traceId: request?.traceId, content: request?.data?.code }
      ];
      // 设置当前请求到的prompt进入输入框上下文，需要联调后检查是否这个意思
      setCurrentInputContextList([
        {
          traceId: request?.traceId,
          type: "prompt",
          role: "user",
          content: request?.data?.userPrompt,
          fileName: "userPrompt"
        },
        {
          traceId: request?.traceId,
          type: "prompt",
          role: "system",
          content: request?.data?.systemPrompt,
          fileName: "systemPrompt"
        }
      ]);
      setIsLoadingPrompt(false);
      return {
        succese: true,
        data: {
          answer: ""
        }
      };
    }
  };

  /**
   * 处理当前对话新增的上下文（也就是输入文字上方的附带区域），产出可以给请求使用的单词对话的prompt。
   * @param {*} inputValue
   * @returns
   */
  const actionContextFn = (inputValue) => {
    const currentChatContext = [];
    const nowUserMessage = {
      role: "user",
      content: ""
    };
    console.log(currentInputContextList);
    if (currentInputContextList.length > 0) {
      currentInputContextList.forEach((item) => {
        if (item.type === "prompt") {
          // 这里原本是希望将当前选中的问题上下文进行统计，然后在请求时将其附带上去。
          // 当前这样设计与userHistoryDataClient.initChatDatas功能冲突，因此先不做处理。
          // 现在将输入框上方附带 prompt 的功能搁置，因为这块不能简单通过前端拼接。暂且搁置
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
    nowUserMessage.content += inputValue;
    console.log("nowUserMessage:", nowUserMessage);
    return nowUserMessage;
  };

  /**
   * 流式请求大模型
   */
  const stream = async () => {
    const response = await sendHTTPChat({ model: currentModel });
    for await (const chunk of response) {
      const content = chunk.content;
      const result = await codeBuffer.current.processWindow(content);
      // 中途主动中断
      if (chunk?.isStop) {
        const resultAll = codeBuffer.current.flush();
        console.log("中断", chunk, resultAll);
        break;
      }
      // 需要保存一份纯粹的字符串形式，后续作为chat应答发送给下一次对话
      historyChatDatas.current += content;
      if (chunk?.finish_reason) {
        const resultAll = codeBuffer.current.flush();
        userHistoryDataClient.addChatData({
          // type: "requestAdd",
          role: "assistant",
          content: historyChatDatas.current
        });
        // debugger;
      }
      // console.log(result);
      if (result) {
        if (result.type === "text") {
          const nowTextTraceId = result.traceId;
          pushMessage(
            "Update",
            {},
            {
              role: "assistant",
              content: result.text,
              nowTraceId: nowTextTraceId,
              nowMessageType: "text",
              nowMessageListRef: currentMarkdownListRef
            }
          );
        }
        if (result.type === "code") {
          const nowTraceId = result.traceId;
          // 如果对于当前的这次代码块没有位置,则录入一个空数组,用于渲染页面
          // 这里也可能直接是返回代码,那么没有assistant数据
          pushMessage(
            "Update",
            {},
            {
              role: "assistant",
              content: result.code,
              language: result.language,
              nowTraceId: nowTraceId,
              nowMessageType: "code",
              nowMessageListRef: currentCodeBlockListRef
            }
          );
        }
      }
    }
  };

  /**
   * 在页面推送聊天消息框。
   * 希望在页面上添加一条消息，然后更新到当前的页面中
   * @param {*} type  当前添加消息到页面是新增记录还是更新记录 Add or Update
   * @param {*} addMessageObject 新增消息对象 role,content
   * @param {*} updateMessageObject 更新消息对象 role,content,language(选填),nowTraceId(必填，当前消息的id),
   * nowMessageType(必填，当前消息块的类型,text,code),nowMessageListRef(必填，当前消息块的引用)
   */
  const pushMessage = (type, addMessageObject, updateMessageObject) => {
    if (type === "Add") {
      const nowUserMessage = {
        role: addMessageObject.role,
        content: addMessageObject.content,
        time: new Date().toLocaleTimeString()
      };
      setCurrentData((prevData) => ({
        ...prevData,
        message: [...prevData?.message, nowUserMessage]
      }));
    } else if (type === "Update") {
      setCurrentData((item) => {
        const newMessage = [...item?.message];
        const lastMessage = newMessage[newMessage.length - 1];
        if (
          lastMessage?.role === updateMessageObject?.role &&
          lastMessage?.content &&
          !lastMessage?.content?.find(
            (item) =>
              item?.traceId === updateMessageObject?.nowTraceId &&
              item?.type === updateMessageObject.nowMessageType
          )
        ) {
          lastMessage.content.push({
            type: updateMessageObject?.nowMessageType,
            traceId: updateMessageObject?.nowTraceId,
            content: updateMessageObject?.content
          });
        }
        return { ...item, message: newMessage };
      });
      // 更新 代码块 or 文本块的页面响应式
      const existMessage = updateMessageObject.nowMessageListRef.current?.find(
        (item) => item.traceId === updateMessageObject.nowTraceId
      );
      if (existMessage) {
        const currentContent = existMessage.content;
        const newContent = currentContent + updateMessageObject?.content;
        const updateList = updateMessageObject.nowMessageListRef.current?.map(
          (item) =>
            item.traceId === updateMessageObject?.nowTraceId
              ? { ...item, content: newContent }
              : item
        );
        updateMessageObject.nowMessageListRef &&
          (updateMessageObject.nowMessageListRef.current = updateList);
        updateMessageObject.nowMessageType === "code"
          ? setCurrentCodeBlockList(updateList)
          : setCurrentMarkdownString(updateList);
      } else {
        const newList = [
          ...updateMessageObject.nowMessageListRef.current,
          {
            traceId: updateMessageObject.nowTraceId,
            content: updateMessageObject.content,
            language: updateMessageObject.language
          }
        ];
        updateMessageObject.nowMessageListRef.current = newList;
        updateMessageObject.nowMessageType === "code"
          ? setCurrentCodeBlockList(newList)
          : setCurrentMarkdownString(newList);
      }
    }
  };

  // 和模型对话
  const handleSendMessage = async () => {
    // 停止当前对话
    if (!inputValue) {
      message.warning("请输入问题");
      return;
    }
    // 发送信息后or初次对话的时候触发当前请求
    setIsComposing(true);
    isComposingRef.current = true;

    // 前端校验结束，那么录入信息
    pushMessage("Add", { role: "user", content: inputValue });
    // 创建助手的空消息
    pushMessage("Add", { role: "assistant", content: [] });

    try {
      // 准备本次对话需要的上下文
      const nowChatData = actionContextFn(inputValue);
      userHistoryDataClient.addChatData(nowChatData);
      stream();
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setInputValue("");
      setIsComposing(false);
      isComposingRef.current = false;
    }
  };

  // 终止对话
  const handleStopSendMessage = () => {
    console.log("handleStopSendMessage");
    stopCurrentChat();
    // 延时100ms停顿，防止重复操作
    setTimeout(() => {
      setIsComposing(false);
      isComposingRef.current = false;
    }, 100);
    return;
  };

  // 处理服务端传递代码的逻辑
  const handleSelectCode = (ws, request) => {
    console.log("handleSelectCode前端页面", ws, request);
    // 获取到代码后，插入到输入框上层的代码展示区域
    currentCodeBlockListRef.current = [
      {
        traceId: request.traceId,
        content: request.data.code,
        language: request.data.language
      }
    ];
  };

  // 插件在idea选中一段代码，传递给前端，让前端展示
  const handleInsertCodeToEditor = (request) => {
    // console.log("handleInsertCodeToEditor前端页面", ws, request);

    return {
      success: true
    };
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
      content: item.content,
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
                )?.content
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
                )?.content
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
                    )?.content
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
          {/* 暂时不展示这个功能区。因为这块的上下文拼接并非简单的文案描述，可能需要再讨论这块的设计 */}
          {/*           
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
          </div> */}
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
            onPaste={handleOnPaste}
            onPressEnter={(e) => {
              if (e.shiftKey) {
                // 如果按下了 Shift 键，不触发发送
                return;
              }
              handleSendMessage(isTop);
            }}
            placeholder="输入消息按Enter发送，Shift+Enter换行"
            disabled={isComposingRef.current}
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
            <div className="chat-submit-btn">
              {isComposingRef.current ? (
                <Button onClick={() => handleStopSendMessage()}>停止</Button>
              ) : (
                <Button onClick={() => handleSendMessage()}>发送</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    console.log("useEffect", window.intellij);

    // 挂载weboskcet处理函数
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
