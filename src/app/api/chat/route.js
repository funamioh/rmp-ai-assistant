import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { input } from "@nextui-org/theme";
import { match } from "assert";
import { start } from "repl";

const systemPrompt = 
`
You are a helpful AI assistant designed to recommend professors to students based on their queries. Your primary function is to analyze student questions and provide the top 3 most relevant professor recommendations using a RAG (Retrieval-Augmented Generation) system.

Your capabilities:
1. Understand and interpret student queries about professor preferences and course requirements.
2. Access a comprehensive database of professor information, including teaching styles, course ratings, difficulty levels, and student feedback.
3. Utilize RAG to retrieve the most relevant professor information based on the student's query.
4. Provide concise yet informative summaries of the top 3 recommended professors.
5. Offer additional context or explanations if requested by the student.

For each student query, you should:
1. Analyze the key requirements and preferences mentioned in the query.
2. Use RAG to retrieve relevant professor information from your database.
3. Rank the professors based on how well they match the student's criteria.
4. Present the top 3 professor recommendations, including:
   - Professor's name and department
   - A brief summary of their teaching style and expertise
   - Relevant course information and ratings
   - Any standout features that match the student's query
5. Be prepared to provide more detailed information or answer follow-up questions about the recommended professors.

Remember to maintain a neutral and informative tone, presenting factual information without bias. Your goal is to help students make informed decisions about their course selections based on professor recommendations.
`

export async function POST(req) {
    const data = await req.json()
        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
        })
        const index = pc.index('rag').namespace("ns1") // ns1 - namespace 1
        const openai = new OpenAI()

        const text = data[data.length - 1].content
        const embedding = await OpenAI.Embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
                embedding_format: 'float',
        })

        const result = await index.query({
            topK: 3,
            includeMetadata: true,
            vector: embedding.data[0].embedding
        })

        let resultString = '\n\nReturned results from vector db (done automatically):'
        resultString.matches.forEach((match) => {
            resultString += `\n
            Professor: ${match.id}
            Review: ${match.metadata.stars}
            Subject: ${match.metadata.subject}
            Stars ${match.metada.stars}
            \n\n
            `
        });

        const lastMessage = data[data.length - 1]
        const lanstMessagaeContent = lastMessage.content + resultString
        const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
        const completion = await openai.chat.completions.create({
            messages: [
                {role: 'system', content: systemPrompt},
                ...lastDataWithoutLastMessage,
                {role: 'user', content: lanstMessagaeContent},
            ],
            model: 'gpt-4o-mini',
            stream: true,
        })

        const stream = ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder()
                try{
                    for await (const chunk of completion){
                        const content = chunk.choices[0]?.delta?.content
                        if (content) {
                            const text = encoder.encode(content)
                            controller.enqueue(text)
                        }
                    }
                }
                catch(err) {
                    controller.error(err)
                } finally {
                        controller.close()
                    }
            },
        })

        return new NextResponse(stream)
}
