import React, { useState, useEffect } from "react";
import "./index.less";
import ReactMarkdown from "react-markdown";
import { Button, message, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import { CopyOutlined } from "@ant-design/icons";
import { handleCopyMessage, detectIfCode } from "../../utils";
import { sendMessageTest } from "../../server/model";
const { Paragraph } = Typography;

const Chat = () => {
  const [currentData, setCurrentData] = useState({ traceId: "", message: [] });
  const [isComposing, setIsComposing] = useState(false); // 是否正在对话的状态
  const [inputValue, setInputValue] = useState("");
  // const [inputIsTop, setInputIsTop] = useState(false); //有对话记录的清空下，输入框是否置顶
  const [pastedCodeData, setPastedCodeData] = useState(""); // 粘贴的代码数据

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

  // 关联websocket，与后端建立链接，然后开始对话
  const fetchData = async () => {
    // 建立websocket链接
    // 建立成功，获取到当前的prompt和traceId
    // 开始对话,这里是首次加载，基于后端已经分析出prompt的前提下
    // handleSendMessage(true);
  };
  // 和模型对话
  const handleSendMessage = async (isFirst) => {
    console.log("handleSendMessage", isFirst, isComposing, inputValue);
    if (isComposing) return;
    // 发送信息后or初次对话的时候触发当前请求
    setIsComposing(true);
    // setInputIsTop(true);

    // 前端校验结束，那么录入信息
    const nowUserMessage = {
      role: "user",
      content: inputValue
    };
    setCurrentData((prevData) => ({
      ...prevData,
      message: [...prevData?.message, nowUserMessage]
    }));

    // 已经建立链接，已经录入问题，已经得到prompt，开始请求
    try {
      const response = await sendMessageTest(inputValue);
      console.log("response前端js", response);
      if (response) {
        const nowAssistantResponse = {
          role: "assistant",
          content: response.message.content
        };
        setCurrentData((prevData) => ({
          ...prevData,
          message: [...prevData?.message, nowAssistantResponse]
        }));
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

  useEffect(() => {
    fetchData();
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
          当前文件跟踪码：{currentData?.traceId}
          <span
            style={{ cursor: "pointer", marginLeft: "5px" }}
            onClick={() => handleCopyMessage(currentData)}
          >
            <CopyOutlined />
          </span>
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
  const CodeDisplay = ({ code }) => (
    <Paragraph
      code={true}
      className="code-display"
      copyable
      editable={false}
      ellipsis={{
        rows: 3,
        expandable: true,
        symbol: "展开",
        onExpand: () => {}
      }}
      style={{
        background: "#f5f5f5",
        padding: "12px",
        borderRadius: "4px",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        userSelect: "text", // 允许选中
        cursor: "default" // 默认光标
      }}
    >
      {code}
    </Paragraph>
  );

  return (
    <div className="chat-box" style={{ margin: "10px" }}>
      {/* {currentData ? ( */}
      <div className="chat-container">
        <div className="chat-content">
          <div className="chat-content-item">
            {!currentData?.message?.length ? (
              <div>{InputComponent("top")}</div>
            ) : (
              <div className="chat-content-item-content">
                {currentData?.message.map((item, index) => (
                  <>
                    <div
                      key={index}
                      className={`inputContainer ${
                        item.role === "user" ? "user" : "assistant"
                      }`}
                    >
                      <div className="chat-content-item-content-user-text-copy">
                        <CopyOutlined onClick={() => handleCopyMessage(item)} />
                      </div>
                      <div className="chat-content-item-content-user-text">
                        <div className="chat-content-item-content-user-text-content">
                          <ReactMarkdown>{item.content}</ReactMarkdown>
                        </div>
                      </div>
                      <div className="chat-content-item-content-time">
                        {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                  </>
                ))}
                <div className="chat-content-item-content-empty">
                  {pastedCodeData}
                  {pastedCodeData ? CodeDisplay(pastedCodeData) : null}
                  {InputComponent("bottom")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* ) : (
        <div>加载中...</div>
      )} */}
    </div>
  );
};

export default Chat;
