// /**
//  * 消息流式处理
//  * @param reader 流式读取器 ReadableStreamDefaultReader
//  * @param answer 回答对象  any
//  * @param question 用户问题 string
//  * @param systemPromptQuestion 系统提示问题 string
//  * @param startTime 开始时间 number
//  */
// export async function flow(
//   reader,
//   answer,
//   question,
//   systemPromptQuestion,
//   startTime
// ) {
//   try {
//     answer.typing = true;
//     answer.children[0].content = "";
//     let buffer = "";    // 缓冲区
//     let decoder = new TextDecoder("utf-8"); // 解码器
//     while (true) {
//       const { done, value } = await reader.read();

//       if (done) {
//         let success = true;
//         if (buffer === null || buffer === "") {
//           error(
//             `model:${models.default.code},userPrompt:`,
//             null,
//             ErrorScenes.CHAT_LLM_RESPONSE_NULL
//           );
//           buffer = "大模型响应错误，请重试～";
//           success = false;
//         }

//         typingRef.current = false;
//         answer.typing = false;
//         answer.children[answer.children.length - 1].content = buffer;
//         setMessages([...messages]);
//         console.log("结束:", answer);
//         llmResponse({
//           success: success,
//           llmContextTraceId: llmContextTraceId,
//           question: question,
//           model: models.default.name ?? "",
//           answer: buffer,
//           cost: new Date().getTime() - startTime
//         });
//         llmContextTraceId = "";
//         break; // Exit the loop when done reading
//       }
//       const chunk = decoder.decode(value, { stream: true });

//       const answers = chunk.split("\n");

//       for (const message of answers) {
//         if (!typingRef.current) {
//           answer.typing = false;
//           setMessages([...messages]);
//           return;
//         }
//         if (!(message.includes("{") && message.includes("}"))) {
//           continue;
//         }
//         const messageT = message.substring(
//           message.indexOf("{"),
//           message.lastIndexOf("}") + 1
//         );
//         const parsed = JSON.parse(messageT);
//         const content =
//           parsed.data ?? parsed.content ?? parsed.choices[0].delta.content;
//         if (content === "[DONE]") {
//           continue;
//         }
//         if (content !== void 0) {
//           if (
//             buffer.length -
//               answer.children[answer.children.length - 1].content.length >
//             200
//           ) {
//             console.log("进行渲染");
//             answer.children[answer.children.length - 1].content = buffer;
//             setMessages([...messages]);
//             await sleep(300);
//           }
//           buffer = formatMarkdownCodeBlocks(buffer + content);
//         } else {
//           answer.children[answer.children.length - 1].content = buffer;
//           throw new EvoError(
//             ErrorScenes.CHAT_LLM_TRANSFER_FAIL,
//             `result:${buffer},lastRoundResult:${answers}`,
//             null
//           );
//         }
//       }
//     }
//   } catch (e) {
//     answer.typing = false;
//     typingRef.current = false;
//     error(
//       `model:${models.default.code},userPrompt:${prompt},systemPrompt:${
//         systemPromptQuestion ?? ""
//       }`,
//       e,
//       ErrorScenes.UNKNOWN_EXCEPTION
//     );
//   }
// }

export class CodeBuffer {
  constructor() {
    this.buffer = ""; // 主缓冲区
    this.isInCodeBlock = false; // 是否在代码块内
    this.currentLanguage = null; // 当前代码块的语言
    this.codeContent = ""; // 当前代码块的内容
    this.textContent = ""; // 普通文本内容
  }

  // 处理新的内容块
  process(chunk) {
    this.buffer += chunk;
    console.log("this.buffer", this.buffer);
    // 查找完整的代码块标记
    const startMatch = this.buffer.match(/```(\w+)?/);
    const endMatch = this.buffer.match(/```\n?/g);
    // 注意文本里的换行
    const textMatch = this.buffer.match(/\n/g);

    // 如果找到开始标记且不在代码块中
    if (startMatch && !this.isInCodeBlock) {
      this.isInCodeBlock = true;
      this.currentLanguage = startMatch[1] || "javascript";
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
      if (textMatch) {
        console.log("出现错误未换行情况");
      }
      debugger;
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
      this.codeContent = this.buffer;
    //   this.codeContent += this.buffer;
    //   this.buffer = "";
      return null; // 继续收集
    }

    // 普通文本处理
    this.textContent = this.buffer;
    this.buffer = "";
    // 如果是文本换行，需要打特殊标记
    return {
      type: "text",
      isNewLine: textMatch && !this.isInCodeBlock,
      content: this.textContent
    };
  }

  // 清空缓冲区
  flush() {
    const remaining = this.buffer + this.codeContent + this.textContent;
    this.reset();
    return remaining
      ? {
          type: "text",
          content: remaining
        }
      : null;
  }

  // 重置所有状态
  reset() {
    this.buffer = "";
    this.isInCodeBlock = false;
    this.currentLanguage = null;
    this.codeContent = "";
    this.textContent = "";
  }
}
