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
      code: this.code,
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

export class CodeBuffer {
  constructor(maxBufferLength = 0) {
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
      this.textContent += this.slidingWindow.slice(0, startMatch.index);
      this.nowCodeBlock.language = startMatch[1] || "java";
      // this.windowState.language = startMatch[1] || "java";
      // 最初的代码快
      this.nowCodeBlock.addCode(
        this.slidingWindow.slice(startMatch.index + startMatch[0].length)
      );

      return {
        type: "text",
        content: this.textContent
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
        this.textContent += afterCode;
      }
      // 字符串式赋值，断开引用
      const nowResultCode = this.nowCodeBlock.fastFlush();
      // 本次代码块结束
      const endResultCode = this.nowCodeBlock.endFlush();
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
    this.textContent += this.slidingWindow;
    return {
      type: "text",
      content: this.textContent
    };
  }

  // 清空缓冲区
  flush() {
    // if (this.windowState.chunkCount < this.maxBufferLength) {
    //  这里去做缓冲区的扩容
    //   const result = this.processWindowAction();
    // }
    // 如果当前代码没干净，情况出现在代码块结束对话的情况
    if (this.nowCodeBlock.nowCode) {
      const nowResultCode = this.nowCodeBlock.fastFlush();
      return {
        type: "code",
        totalCodeBuffer: this.codeHistory,
        ...nowResultCode
      };
    } else {
      this.reset();
      return {
        type: "text",
        totalCodeBuffer: this.codeHistory,
        content: this.slidingWindow + this.textContent
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
