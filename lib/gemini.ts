import { GoogleGenerativeAI, type Part } from '@google/generative-ai'
import { DEFAULT_SYSTEM_PROMPT } from './prompts'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')

export interface MaterialContext {
  type: 'text' | 'pdf'
  content: string  // テキスト文字列 または base64エンコードされたPDF
}

export async function formatMinutes(transcription: string, material?: MaterialContext, systemPrompt?: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
  })

  const basePrompt = `以下の文字起こしテキストを議事録にまとめてください。\n\n${transcription}`

  if (material?.type === 'pdf') {
    // GeminiのPDFインラインデータ機能を使用
    const parts: Part[] = [
      { inlineData: { mimeType: 'application/pdf', data: material.content } },
      { text: basePrompt },
    ]
    const result = await model.generateContent(parts)
    return result.response.text()
  }

  if (material?.type === 'text') {
    const result = await model.generateContent(
      `【講義資料】\n${material.content}\n\n---\n\n${basePrompt}`
    )
    return result.response.text()
  }

  const result = await model.generateContent(basePrompt)
  return result.response.text()
}
