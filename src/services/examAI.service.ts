import fs from "fs";
import path from "path";
import os from "os";
import Groq from "groq-sdk";
import OpenAI from "openai";
import * as ej2PdfPkg from "@syncfusion/ej2-pdf";
import * as ej2ExtractPkg from "@syncfusion/ej2-pdf-data-extract";

const ej2Pdf = (ej2PdfPkg as any).default || ej2PdfPkg;
const ej2Extract = (ej2ExtractPkg as any).default || ej2ExtractPkg;

const PdfDocument = ej2Pdf.PdfDocument;
const PdfDataExtractor = ej2Extract.PdfDataExtractor;
import { appConfig } from "../config/app.config.js";
import { generatePresignedGetUrl } from "./s3AWS.js";
import type { GeneratedQuestionItem } from "../constants/types.js";

export const OPEN_ROUTER_MODEL = "qwen/qwen-2.5-72b-instruct";

export const openRouterClient = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: appConfig.open_router_api_key,
    defaultHeaders: {
        "HTTP-Referer": appConfig.clientUrl || "https://classroom.edu",
        "X-OpenRouter-Title": "ClassRoom Platform",
    },
});

export const groqClient = new Groq({
    apiKey: appConfig.groq_api_key,
});

/**
 * Downloads a file from S3 to a local temp path using a short-lived presigned GET URL.
 */
export const downloadPdfLocally = async (s3Key: string, destPath: string): Promise<void> => {
    const presignedGetUrl = await generatePresignedGetUrl(s3Key, 300);
    const response = await fetch(presignedGetUrl);
    if (!response.ok) {
        throw new Error(`Failed to download PDF from S3 (${response.status}: ${response.statusText})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
};

export interface ExtractedPdfData {
    fullText: string;
    sampledText: string;
    pageCount: number;
    images: Array<{ mimeType: string; base64: string }>;
}

/**
 * Extracts text and images using Syncfusion PdfDataExtractor,
 * proportionally sampling text across the document up to ~75,000 tokens (~300,000 chars)
 * to ensure questions cover the entire document rather than just the beginning.
 */
export const extractPdfContent = async (pdfFilePath: string): Promise<ExtractedPdfData> => {
    const fileBuffer = await fs.promises.readFile(pdfFilePath);
    const uint8Array = new Uint8Array(fileBuffer);

    const document = new PdfDocument(uint8Array);
    const extractor = new PdfDataExtractor(document);
    const pageCount = document.pageCount || 1;

    const pageTexts: string[] = [];

    // Extract text page by page
    for (let page = 0; page < pageCount; page++) {
        try {
            const textLines = await extractor.extractTextLines({
                startPageIndex: page,
                endPageIndex: page,
            });
            const pageContent = textLines
                .map((line: any) => (line && line.text ? line.text : ""))
                .join(" ")
                .trim();
            pageTexts.push(pageContent);
        } catch (err) {
            console.warn(`[Syncfusion] Warning extracting page ${page}:`, err);
            pageTexts.push("");
        }
    }

    // Extract embedded images (only when DOM document is available, e.g. browser environment)
    const images: Array<{ mimeType: string; base64: string }> = [];
    if (typeof (globalThis as any).document !== "undefined") {
        try {
            const extractedImages = await extractor.extractImages({
                startPageIndex: 0,
                endPageIndex: Math.min(pageCount - 1, 20), // scan up to first 20 pages for diagrams
            });

            if (extractedImages && extractedImages.length > 0) {
                for (const img of extractedImages) {
                    // Ignore tiny icons or spacers (< 3KB)
                    if (img.data && img.data.byteLength > 3072) {
                        const mime = String(img.type || "").toLowerCase().includes("png") ? "image/png" : "image/jpeg";
                        const base64 = Buffer.from(img.data).toString("base64");
                        images.push({ mimeType: mime, base64 });
                        // Cap at 4 representative diagrams to prevent oversized payloads
                        if (images.length >= 4) break;
                    }
                }
            }
        } catch {
            // Silently ignore image extraction errors in headless environments
        }
    }

    const fullText = pageTexts.join("\n\n");
    // Qwen 2.5 72B on OpenRouter has a 32,768 token context window.
    // 60,000 characters (~15,000 tokens) provides extensive document coverage while staying well inside limits.
    const MAX_TARGET_CHARS = 60_000;

    let sampledText = "";
    if (fullText.length <= MAX_TARGET_CHARS) {
        sampledText = fullText;
    } else {
        // Proportionally allocate budget across all pages
        const budgetPerPage = Math.max(200, Math.floor(MAX_TARGET_CHARS / pageCount));
        const sampledPages: string[] = [];
        for (let i = 0; i < pageCount; i++) {
            const pageStr = pageTexts[i] || "";
            if (pageStr.length <= budgetPerPage) {
                sampledPages.push(`--- PAGE ${i + 1} ---\n` + pageStr);
            } else {
                // Sample beginning and end of the page
                const half = Math.floor(budgetPerPage / 2);
                const chunk = pageStr.substring(0, half) + "\n[...]\n" + pageStr.substring(pageStr.length - half);
                sampledPages.push(`--- PAGE ${i + 1} ---\n` + chunk);
            }
        }
        sampledText = sampledPages.join("\n\n");
        if (sampledText.length > MAX_TARGET_CHARS) {
            sampledText = sampledText.slice(0, MAX_TARGET_CHARS) + "\n[...]";
        }
    }

    return {
        fullText,
        sampledText,
        pageCount,
        images,
    };
};

/**
 * Validates generated questions server-side against strict pedagogical rules.
 */
export const validateGeneratedQuestions = (
    rawQuestions: any[],
    expectedCount: number,
    defaultDifficulty: "EASY" | "MEDIUM" | "HARD"
): GeneratedQuestionItem[] => {
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        throw new Error("AI returned no questions array");
    }

    const validQuestions: GeneratedQuestionItem[] = [];
    const seenPrompts = new Set<string>();

    for (const item of rawQuestions) {
        const questionText = (item.question || "").trim();
        if (!questionText || questionText.length < 5) {
            continue;
        }

        const normalizedPrompt = questionText.toLowerCase().replace(/\s+/g, " ");
        if (seenPrompts.has(normalizedPrompt)) {
            continue; // Skip duplicate question
        }

        let optionsObj: { A: string; B: string; C: string; D: string };

        if (item.options && typeof item.options === "object" && !Array.isArray(item.options)) {
            const rawA = String(item.options.A || item.options.a || "").trim();
            const rawB = String(item.options.B || item.options.b || "").trim();
            const rawC = String(item.options.C || item.options.c || "").trim();
            const rawD = String(item.options.D || item.options.d || "").trim();

            if (!rawA || !rawB) {
                continue;
            }

            optionsObj = {
                A: rawA,
                B: rawB,
                C: rawC || "None of the above",
                D: rawD || "All of the above",
            };
        } else if (Array.isArray(item.options)) {
            const rawList = item.options.map((o: any) => String(o).trim()).filter((o: string) => o.length > 0);
            if (rawList.length < 2) continue;
            optionsObj = {
                A: rawList[0] || "",
                B: rawList[1] || "",
                C: rawList[2] || "None of the above",
                D: rawList[3] || "All of the above",
            };
        } else {
            continue;
        }

        // Determine correctOption as strictly "A" | "B" | "C" | "D"
        let rawCorrect = String(item.correctOption || "").trim().toUpperCase();
        let correctOption: "A" | "B" | "C" | "D" = "A";

        if (["A", "B", "C", "D"].includes(rawCorrect)) {
            correctOption = rawCorrect as "A" | "B" | "C" | "D";
        } else {
            const lowerCorrect = String(item.correctOption || "").trim().toLowerCase();
            if (lowerCorrect.startsWith("option a") || lowerCorrect.startsWith("a)") || lowerCorrect.startsWith("a.")) {
                correctOption = "A";
            } else if (lowerCorrect.startsWith("option b") || lowerCorrect.startsWith("b)") || lowerCorrect.startsWith("b.")) {
                correctOption = "B";
            } else if (lowerCorrect.startsWith("option c") || lowerCorrect.startsWith("c)") || lowerCorrect.startsWith("c.")) {
                correctOption = "C";
            } else if (lowerCorrect.startsWith("option d") || lowerCorrect.startsWith("d)") || lowerCorrect.startsWith("d.")) {
                correctOption = "D";
            } else if (optionsObj.A.toLowerCase() === lowerCorrect) {
                correctOption = "A";
            } else if (optionsObj.B.toLowerCase() === lowerCorrect) {
                correctOption = "B";
            } else if (optionsObj.C.toLowerCase() === lowerCorrect) {
                correctOption = "C";
            } else if (optionsObj.D.toLowerCase() === lowerCorrect) {
                correctOption = "D";
            } else {
                correctOption = "A";
            }
        }

        const difficulty: "EASY" | "MEDIUM" | "HARD" = ["EASY", "MEDIUM", "HARD"].includes(
            (item.difficulty || "").toUpperCase()
        )
            ? (item.difficulty.toUpperCase() as "EASY" | "MEDIUM" | "HARD")
            : defaultDifficulty;

        const reason = (item.reason || "").trim() || "Correct based on the study material.";

        validQuestions.push({
            question: questionText,
            options: optionsObj,
            correctOption,
            reason,
            difficulty,
        });

        seenPrompts.add(normalizedPrompt);
    }

    if (validQuestions.length === 0) {
        throw new Error("No valid questions could be validated from AI response");
    }

    // Return exactly up to expectedCount
    return validQuestions.slice(0, expectedCount);
};

/**
 * Invokes OpenRouter with qwen/qwen-2.5-72b-instruct to generate structured MCQ questions.
 * Note: qwen/qwen-2.5-72b-instruct accepts text input with json_object mode.
 */
export const generateQuestionsWithOpenRouter = async (params: {
    title: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    questionCount: number;
    teacherInstructions?: string | undefined;
    sampledText: string;
    images?: Array<{ mimeType: string; base64: string }>;
}): Promise<GeneratedQuestionItem[]> => {
    const { title, difficulty, questionCount, teacherInstructions, sampledText } = params;

    const systemPrompt = `You are a distinguished university professor and examination curator.
Your mission is to generate exactly ${questionCount} multiple-choice examination questions based entirely on the supplied course text.
You MUST output a valid JSON object matching this exact structure:
{
  "questions": [
    {
      "question": "Question text here",
      "options": {
        "A": "Option A text",
        "B": "Option B text",
        "C": "Option C text",
        "D": "Option D text"
      },
      "correctOption": "A",
      "reason": "Clear explanation of why option A is correct based on the text",
      "difficulty": "${difficulty}"
    }
  ]
}

Strict Rules:
1. Every question must be distinct, challenging, and assess conceptual understanding.
2. Target Difficulty Level: ${difficulty}.
3. "options" must be a JSON object with exactly four keys: "A", "B", "C", and "D".
4. "correctOption" MUST be only one single letter: "A", "B", "C", or "D".
5. Base all answers strictly on the supplied document text.`;

    const userPromptText = `Exam Title: ${title}
Target Question Count: ${questionCount}
Difficulty Level: ${difficulty}
${teacherInstructions ? `Teacher Instructions: ${teacherInstructions}\n` : ""}
--- DOCUMENT CONTEXT ---
${sampledText}
--- END DOCUMENT CONTEXT ---

Generate exactly ${questionCount} high-quality questions in the required JSON format now.`;

    let completion: any;
    try {
        completion = await openRouterClient.chat.completions.create({
            model: OPEN_ROUTER_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPromptText },
            ],
            response_format: { type: "json_object" },
            temperature: 0.6,
        });
    } catch (err: any) {
        console.error(`[OpenRouter] Generation request failed:`, err.message || err);
        throw err;
    }

    const rawContent = completion?.choices?.[0]?.message?.content;
    if (!rawContent) {
        throw new Error("Received empty response content from OpenRouter model");
    }

    let parsed: any;
    try {
        parsed = JSON.parse(rawContent);
    } catch (parseError: any) {
        throw new Error(`Failed to parse OpenRouter JSON output: ${parseError.message}`);
    }

    const questionsList = parsed.questions || parsed.data || [];
    return validateGeneratedQuestions(questionsList, questionCount, difficulty);
};

// Aliases for compatibility
export const generateQuestionsWithAI = generateQuestionsWithOpenRouter;
export const generateQuestionsWithGroq = generateQuestionsWithOpenRouter;
