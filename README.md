# 项目简介

本项目是作为 intelliJ IDEA 插件的交互页面，用于将本地代码与大模型进行特定需求（自动生成单例、针对当前代码进行上下文对话等）
本项目也可作为基础对话页面，直接运行不需依赖后端。

## 涉及内容

- ✅ （本地/远程）模型请求 LLM
- ✅ 流式数据处理，实时显示 AI 回答。保存单对话上下文、支持对话中断和继续。
- ✅ 支持代码块高亮展示，支持流式文字展示，支持对话代码提问，支持对话内容的局部复制。
- ✅ websocket 链接
- ✅ 本地 Java 代码对应单例生成（需与后端搭配）
- ✅ 本地 Java 代码解析
- 🤔 代码检测
- 🤔 代码补全
- 🤔 多种信息格式的上下文支持（图片、文件、同项目代码）

## 项目结构

- src/page/chat/index.jsx 聊天页面
- src/page/chat/index.less 聊天页面样式
- src/server/model.js 模型请求相关方法、用户本次对话的记录
- src/server/websocket.js 用于与插件建立 websocket 链接的相关方法
- src/utils/buffer.js 交互数据流式处理相关方法
- src/utils/index.js 其他方法


# 项目运行 🚀



## 使用本地模型（Ollama）

- 下载 ollama 模型
  - 下载地址：[https://ollama.ai/models](https://ollama.com/)
  - 选择模型（本代码使用 qwen2.5）[text](https://ollama.com/library/qwen2.5)
    - 注意 ⚠️：不同代码的返回体需要查询对应文档，并稍微修改逻辑。
- 启动 ollama 模型
  - 启动 ollama : `ollama serve`
- 修改 src/server/config.js 中的 OllamaConfig 模型名称
  - 查询本地已下载的模型：`ollama list`
