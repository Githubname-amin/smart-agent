import React, { useState, useEffect } from "react";
import "./index.less";
import ReactMarkdown from "react-markdown";
import { Button, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { CopyOutlined } from "@ant-design/icons";

const Chat = () => {
  const [currentData, setCurrentData] = useState(null);
  const [isComposing, setIsComposing] = useState(false); // 是否正在对话的状态
  const [inputValue, setInputValue] = useState("");

  const fetchData = async () => {
    // const data = await fetch("http://localhost:8080/api/v1/chat/getChatData");
    const data = {
      traceId: "1234567890",
      message: [
        {
          role: "user",
          content: "你好，我是小明，我有一个问题需要你帮我解决。"
        },
        {
          role: "assistant",
          content: "好的，我会帮你解决这个问题。"
        },
        {
          role: "user",
          content: "好的，谢谢你。"
        },
        {
          role: "assistant",
          content: "好的，我会帮你解决这个问题。"
        }
      ]
    };
    setCurrentData(data);
  };

  const handleCopyMessage = (item) => {
    navigator.clipboard.writeText(item.content);
    message.success("复制成功");
  };

  const handleSendMessage = () => {
    if (isComposing) return;
    console.log("enter");
  };

  useEffect(() => {
    fetchData();
  }, []);

  //   输入框组件
  const InputComponent = () => (
    <div className="chat-input-component">
      <div className="chat-input-component-title">
        当前文件跟踪码：{currentData?.traceId}
      </div>
      <TextArea
        autoSize={{ minRows: 3, maxRows: 6 }}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onPressEnter={(e) => {
          console.log("enter", e);
          handleSendMessage();
        }}
        onKeyDown={(e) => {
          console.log("keyDown", e);
        }}
        placeholder="输入消息按Enter发送，Shift+Enter换行"
        disabled={isComposing}
      />
      <Button type="primary" onClick={handleSendMessage}>
        {isComposing ? "停止" : "发送"}
      </Button>
    </div>
  );

  return (
    <div className="chat-box" style={{ margin: "10px" }}>
      {currentData ? (
        <div className="chat-container">
          <div className="chat-content">
            <div className="chat-content-item">
              <div>{InputComponent()}</div>
              {currentData?.message.length > 0 ? (
                <div className="chat-content-item-content">
                  {currentData?.message.map((item, index) => (
                    <div
                      key={index}
                      className={
                        item.role === "user"
                          ? "chat-content-item-content-user"
                          : "chat-content-item-content-assistant"
                      }
                    >
                      <div className="chat-content-item-content-user-text">
                        <div>
                          <ReactMarkdown>{item.content}</ReactMarkdown>
                        </div>
                        <Button
                          type="primary"
                          className="chat-content-item-content-user-text-copy"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyMessage(item)}
                        >
                          复制
                        </Button>
                      </div>
                      <div>{new Date().toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="chat-content-item-content-empty">
                  <InputComponent />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>加载中...</div>
      )}
    </div>
  );
};

export default Chat;
