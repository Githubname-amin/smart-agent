import { sleep } from "openai/core.mjs";

export class CodeBuffer {
  constructor(codeTraceId, maxBufferLength = 8) {
    this.codeTraceId = codeTraceId; // 当前代码块的traceId
    this.maxBufferLength = maxBufferLength;
    this.buffer = ""; // 主缓冲区
    this.isInCodeBlock = false; // 是否在代码块内
    this.currentLanguage = null; // 当前代码块的语言
    this.codeContent = ""; // 当前代码块的内容
    this.textContent = ""; // 普通文本内容

    // 滑动窗口相关
    this.slidingWindow = ""; // 滑动窗口
    this.windowPause = false; // 是否暂停窗口
    this.windowState = {
      language: null,
      state: "", // TEXT CODE_START CODE CODE_END
      chunkCount: 0
    };
    this.codeQueue = "";
    this.specialChars = {
      inlineCode: ["`"],
      mathSymbol: ["+", "-", "*", "/"]
    };
  }

  // 处理新的内容块
  process(chunk) {
    this.buffer += chunk;
    console.log("this.buffer", this.buffer);
    // 查找完整的代码块标记
    const startMatch = this.buffer.match(/```(\w+)?/);
    const endMatch = this.buffer.match(/```\n?/g);

    // 如果找到开始标记且不在代码块中
    if (startMatch && !this.isInCodeBlock) {
      console.log("startMatch", startMatch);
      this.currentLanguage = startMatch[1] || "javascript";
      // 如果当前的开始云分号是在上一个chunk而语言类型在下一个分号，则需要处理
      this.isInCodeBlock = true;
      // 将开始标记之前的内容添加到文本内容
      this.textContent += this.buffer.slice(0, startMatch.index);
      // 更新缓冲区
      this.buffer = this.buffer.slice(startMatch.index + startMatch[0].length);
      return {
        type: "text",
        content: this.textContent
      };
    }

    // 如果在代码块中且找到结束标记
    if (this.isInCodeBlock && endMatch) {
      const endIndex = this.buffer.indexOf("```");

      // 收集代码内容
      this.codeContent += this.buffer.slice(0, endIndex);
      // 重置状态
      this.isInCodeBlock = false;
      const code = this.codeContent;
      this.codeContent = "";
      // 更新缓冲区
      this.buffer = this.buffer.slice(endIndex + 3);
      return {
        type: "code",
        language: this.currentLanguage,
        content: code
      };
    }

    // 如果在代码块中
    if (this.isInCodeBlock) {
      this.codeContent += this.buffer;
      this.buffer = "";
      return null; // 继续收集
    }

    // 普通文本处理
    this.textContent = this.buffer;
    this.buffer = "";
    // 如果是文本换行，需要打特殊标记
    return {
      type: "text",
      isNewLine: !this.isInCodeBlock,
      content: this.textContent
    };
  }

  // 使用滑动窗口实现字符处理
  async processWindow(chunk) {
    await sleep(100);
    this.slidingWindow += chunk;
    this.windowState.chunkCount++;

    // if (this.windowPause) {
    //   return null;
    // }

    // 初期收集阶段
    if (this.windowState.chunkCount < this.maxBufferLength) {
      return null;
    }

    // 处理窗口中的内容
    const result = this.processWindowAction();
    // 处理了一段时间后，将部分字符输出
    if (result?.type === "code") {
      // 清空记录的代码
      this.codeQueue = "";
      this.slidingWindow = "";
      // debugger;
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
      // this.windowPause = true;
      return null;
    }
    // 和之前写法一致，检查代码块标记
    const startMatch = this.slidingWindow.match(/```(\w+)?/);
    const endMatch = this.slidingWindow.match(/```\n?/g);

    // 初始阶段
    if (startMatch && this.windowState.state !== "CODE_START") {
      // 检查是否是有效的代码块开始
      const isValidStart = this.isValidCodeBlockStart(startMatch);
      if (!isValidStart) {
        // this.windowPause = true;
        return null;
      }
      this.windowState.state = "CODE_START";
      this.textContent += this.slidingWindow.slice(0, startMatch.index);
      this.windowState.language = startMatch[1] || "java";
      // 最初的代码快
      this.codeQueue += this.slidingWindow.slice(
        startMatch.index + startMatch[0].length
      );
      // this.windowPause = false;
      return {
        type: "text",
        content: this.textContent
      };
    }

    // 如果在代码快中且找到结束标志
    if (endMatch && this.windowState.state === "CODE_START") {
      // 检查是否是有效的代码块结束
      // debugger;
      const isValidEnd = this.isValidCodeBlockEnd(endMatch[0]);
      if (!isValidEnd) {
        // this.windowPause = true;
        return null;
      }
      this.windowState.state = "CODE_END";
      const endIndex = this.slidingWindow.indexOf("```");
      this.codeQueue += this.slidingWindow.slice(0, endIndex);
      // 可能分号符后面存在文案,那么记录文案
      const afterCode = this.slidingWindow.slice(endIndex + 3);
      if (afterCode) {
        this.textContent += afterCode;
      }
      // 字符串式赋值，断开引用
      const resultCode = this.codeQueue;

      // this.windowPause = false;
      return {
        type: "code",
        content: resultCode
      };
    }

    // 在代码区域
    if (this.windowState.state === "CODE_START") {
      this.codeQueue += this.slidingWindow;
      return {
        type: "code",
        content: this.codeQueue,
        language: this.windowState.language
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
    const remaining = this.slidingWindow + this.textContent;
    if (this.codeQueue) {
      this.reset();
      const resultCode = remaining + this.codeQueue;
      return {
        type: "code",
        content: resultCode
      };
    } else {
      this.reset();
      return {
        type: "text",
        content: remaining
      };
    }
  }

  // 重置所有状态
  reset() {
    this.buffer = "";
    this.slidingWindow = "";
    this.windowState = {
      language: null,
      state: "", // TEXT CODE_START CODE CODE_END
      chunkCount: 0
    };
    this.codeQueue = "";
    this.codeTraceId = null;
    this.isInCodeBlock = false;
    this.currentLanguage = null;
    this.codeContent = "";
    this.textContent = "";
  }

  // 检查不完整的云括号结尾
  checkIncompleteBackticks(text) {
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
