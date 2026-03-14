import { GoogleGenerativeAI } from '@google/generative-ai'

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
}

export async function embedText(text: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-embedding-001' })
  const result = await model.embedContent(text)
  return result.embedding.values
}

export async function streamChat(
  systemPrompt: string,
  history: { role: string; text: string }[],
  message: string
): Promise<string> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' })
  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: "Got it — I'm Gelly, ready to coach. What do you need help with?" }] },
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
    ],
  })
  const result = await chat.sendMessage(message)
  return result.response.text()
}
