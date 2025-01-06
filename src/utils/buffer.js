import { sleep } from "openai/core.mjs";
import { generateTraceId } from "./index";

class CodeBlock {
  constructor(codeTraceId) {
    this.codeTraceId = codeTraceId; // 当前代码块的traceId
    this.code = ""; // 整个代码块的内容,用来最终返回,做备份,或者是后续插入代码
    this.nowCode = ""; // 当前代码块的内容,用来做流式展示
    this.language = ""; // 当前代码块的语言
  }

  // 添加代码块
  // 这里是对于最初的添加的定制方法，会将云括号后续的代码记录一次
  addCode(code) {
    this.code += code;
    this.nowCode += code;
  }

  // 获取代码块
  getCode() {
    return this.code;
  }

  // 过程快照，用作流式返回
  fastFlush() {
    const resultCode = {
      code: this.nowCode,
      language: this.language,
      traceId: this.codeTraceId
    };
    this.nowCode = "";
    return resultCode;
  }

  // 最终快照，会返回整个代码块的信息
  // 清空当前代码快,返回剩下全部数据
  endFlush() {
    const resultCode = {
      code: this.nowCode,
      allCode: this.code,
      language: this.language,
      traceId: this.codeTraceId
    };
    this.resetCodeBlock();
    return resultCode;
  }

  // 重置当前代码块
  resetCodeBlock() {
    this.code = "";
    this.language = "";
    this.codeTraceId = "";
  }
}

class TextBlock {
  constructor(textTraceId) {
    this.textTraceId = textTraceId; // 当前文本块的traceId
    this.text = ""; // 整个文本块的内容,用来最终返回,做备份,或者是后续插入代码
    this.nowText = ""; // 当前文本块的内容,用来做流式展示
  }

  // 添加文本块
  addText(text) {
    this.text += text;
    this.nowText += text;
  }

  // 获取文本块
  getText() {
    return this.text;
  }

  // 过程快照，用作流式返回
  fastFlush() {
    const resultText = {
      text: this.nowText,
      traceId: this.textTraceId
    };
    this.nowText = "";
    return resultText;
  }

  // 最终快照，会返回整个文本块的信息
  // 清空当前文本块,返回剩下全部数据
  endFlush() {
    const resultText = {
      allText: this.text,
      text: this.nowText,
      traceId: this.textTraceId
    };
    this.resetTextBlock();
    return resultText;
  }

  // 重置当前文本块
  resetTextBlock() {
    this.text = "";
    this.textTraceId = "";
  }
}

export class CodeBuffer {
  constructor(textTraceId, maxBufferLength = 0) {
    this.codeTraceId = null; // 当前代码块的traceId
    this.maxBufferLength = maxBufferLength; //当前预处理缓冲池的最大格式，当前关闭了，因为最后如果以代码结尾需要特殊处理。可开启，然后稍微改造flush即可
    // 滑动窗口相关
    this.slidingWindow = ""; // 滑动窗口
    this.textContent = ""; // 普通文本内容
    this.windowState = {
      language: null,
      state: "", // TEXT CODE_START CODE CODE_END
      chunkCount: 0
    };
    this.specialChars = {
      inlineCode: ["`"],
      mathSymbol: ["+", "-", "*", "/"]
    };
    // 代码相关
    this.nowCodeBlock = null;
    this.codeHistory = [];
    // 文本相关
    this.textTraceId = textTraceId;
    this.nowTextBlock = null;
    this.textHistory = [];
  }

  // 使用滑动窗口实现字符处理
  async processWindow(chunk) {
    await sleep(100);
    this.slidingWindow += chunk;
    this.windowState.chunkCount++;

    // 初期收集阶段
    if (this.windowState.chunkCount < this.maxBufferLength) {
      // 弊端：当最后剩下小于maxBufferLength的时候，会强硬退出
      // 需要在末尾函数的时候，处理一下
      return null;
    }

    // 处理窗口中的内容
    const result = this.processWindowAction();
    // 处理了一段时间后，将部分字符输出
    if (result?.type === "code") {
      // 清空记录的代码
      this.slidingWindow = "";
      this.windowState.chunkCount = 0;
    } else if (result?.type === "text") {
      // 清空记录的代码
      this.textContent = "";
      this.slidingWindow = "";
      this.windowState.chunkCount = 0;
    }

    return result;
  }

  processWindowAction() {
    // 如果云括号在本次检测中垫底了
    // 临界点，本次跳过，下次统一处理
    // 否则可能不能准确开始代码，或者准确结束代码
    const endsWithIncompleteBackticks = this.checkIncompleteBackticks(
      this.slidingWindow
    );
    if (endsWithIncompleteBackticks) {
      return null;
    }
    // 和之前写法一致，检查代码块标记
    const startMatch = this.slidingWindow.match(/```(\w+)?/);
    const endMatch = this.slidingWindow.match(/```\n?/g);

    // 初始阶段
    if (startMatch && this.windowState.state !== "CODE_START") {
      // 初始阶段,创建一个代码块,并且开始向其中录入数据
      this.codeTraceId = generateTraceId(); //当前代码块编码
      this.nowCodeBlock = new CodeBlock(this.codeTraceId);
      // 检查是否是有效的代码块开始
      const isValidStart = this.isValidCodeBlockStart(startMatch);
      if (!isValidStart) {
        return null;
      }
      this.windowState.state = "CODE_START";
      this.nowCodeBlock.language = startMatch[1] || "java";
      // 最初的代码快
      this.nowCodeBlock.addCode(
        this.slidingWindow.slice(startMatch.index + startMatch[0].length)
      );

      // 剩余文本相关处理
      this.nowTextBlock.addText(this.slidingWindow.slice(0, startMatch.index));
      const nowTextResult = this.nowTextBlock.fastFlush();
      // 本次文本块结束
      const endTextResult = this.nowTextBlock?.endFlush();
      this.nowTextBlock = null;
      this.textTraceId = null;
      this.textHistory.push(endTextResult);
      return {
        type: "text",
        ...nowTextResult
      };
    }

    // 如果在代码快中且找到结束标志
    if (endMatch && this.windowState.state === "CODE_START") {
      // 检查是否是有效的代码块结束
      const isValidEnd = this.isValidCodeBlockEnd(endMatch[0]);
      if (!isValidEnd) {
        return null;
      }
      this.windowState.state = "CODE_END";
      const endIndex = this.slidingWindow.indexOf("```");
      this.nowCodeBlock.addCode(this.slidingWindow.slice(0, endIndex));

      // 可能分号符后面存在文案,那么记录文案
      const afterCode = this.slidingWindow.slice(endIndex + 3);
      if (afterCode) {
        // 代码块结束转文本块，重新创建一个
        this.textTraceId = generateTraceId();
        this.nowTextBlock = new TextBlock(this.textTraceId);
        this.nowTextBlock.addText(afterCode);
      }
      // 字符串式赋值，断开引用
      const nowResultCode = this.nowCodeBlock?.fastFlush();
      // 本次代码块结束
      const endResultCode = this.nowCodeBlock?.endFlush();
      this.codeHistory.push(endResultCode);

      return {
        type: "code",
        ...nowResultCode
      };
    }

    // 在代码区域
    if (this.windowState.state === "CODE_START") {
      this.nowCodeBlock.addCode(this.slidingWindow);
      const resultCode = this.nowCodeBlock.fastFlush();
      return {
        type: "code",
        ...resultCode
      };
    }

    // 普通文本区域
    // 默认创建一个文本编号，当出现其他内容的时候，都会触发文本编号的变更。如果没有其他内容，那么全文共用一个
    if (this.textTraceId) {
      // 存在文本编号不存在块，则是在其他地方清除了上一个块，那么创建一个文本块
      if (!this.nowTextBlock) {
        // 这是第一次创建
        this.nowTextBlock = new TextBlock(this.textTraceId);
      }
      this.nowTextBlock.addText(this.slidingWindow);
    } else {
      // 这是后续被清除后的创建
      this.nowTextBlock = new TextBlock(generateTraceId());
      this.nowTextBlock.addText(this.slidingWindow);
      this.textTraceId = this.nowTextBlock.textTraceId;
    }
    // this.textContent += this.slidingWindow;
    return {
      type: "text",
      ...this.nowTextBlock.fastFlush()
    };
  }

  // 清空缓冲区
  flush() {
    // if (this.windowState.chunkCount < this.maxBufferLength) {
    //  这里去做缓冲区的扩容
    //   const result = this.processWindowAction();
    // }
    // 如果当前代码没干净，情况出现在代码块结束对话的情况
    if (this.nowCodeBlock?.nowCode) {
      const nowResultCode = this.nowCodeBlock?.endFlush();
      return {
        type: "code",
        totalCodeBuffer: this.codeHistory,
        totalTextBuffer: this.textHistory,
        ...nowResultCode
      };
    } else if (this.nowTextBlock?.nowText) {
      // 还有剩余，按说没有，最后会走下面的else
      const nowTextResult = this.nowTextBlock?.endFlush();
      this.textHistory.push(nowTextResult);
      this.reset();
      return {
        type: "text",
        totalCodeBuffer: this.codeHistory,
        totalTextBuffer: this.textHistory,
        ...nowTextResult
      };
    } else {
      // 处理的很干净，那么返回想要的数据
      console.log("最后查看", this.textHistory, this.nowTextBlock);
      const endTextResult = this.nowTextBlock?.endFlush();
      this.textHistory.push(endTextResult);
      this.reset();
      return {
        type: "all",
        totalCodeBuffer: this.codeHistory,
        totalTextBuffer: this.textHistory
      };
    }
  }

  // 重置所有状态
  reset() {
    this.slidingWindow = "";
    this.windowState = {
      language: null,
      state: "", // TEXT CODE_START CODE CODE_END
      chunkCount: 0
    };
    this.codeTraceId = null;
    this.nowCodeBlock = null;
    this.textTraceId = null;
    this.nowTextBlock = null;
    this.textContent = "";
  }

  // 检查不完整的云括号结尾
  checkIncompleteBackticks(text) {
    // 如果当前内容包含云括号，我就打印，检查一下
    // if (text.includes("`")) {
    //   console.log("检查云括号", text);
    // }
    // 检查是否以1-3个反引号结尾
    const backtickMatch = text.match(/`{1,3}$/);
    if (backtickMatch) {
      return true;
    }

    // 检查是否以反引号开始但没有语言标识或换行
    const incompleteStart = text.match(/```\s*$/);
    if (incompleteStart) {
      return true;
    }

    return false;
  }
  // 检查是否是有效的代码块开始
  isValidCodeBlockStart(match) {
    if (!match) return false;

    // 检查是否只是反引号而不是完整的代码块开始
    if (match[0] === "`" || match[0] === "``") {
      return false;
    }

    // 检查是否有完整的开始标记（包括语言标识符和换行）
    const fullMatch = this.slidingWindow.slice(match.index);
    const hasNewline = /```(\w+)?\n/.test(fullMatch);

    // 如果没有换行符，可能是不完整的开始标记
    if (!hasNewline) {
      return false;
    }

    return true;
  }

  // 检查是否是有效的代码块结束
  isValidCodeBlockEnd(match) {
    if (!match) return false;

    // 检查结束标记后是否有换行或者是字符串末尾
    const endIndex = this.slidingWindow.indexOf(match) + 3;
    if (endIndex < this.slidingWindow.length) {
      return this.slidingWindow[endIndex] === "\n";
    }

    return true;
  }
}
