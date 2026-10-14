import type { AttemptAnswerItem, AnswerKeyItem } from "../constants/types.js";

export interface EvaluationResult {
    totalScore: number;
    maxScore: number;
    finalAnswersJSON: AttemptAnswerItem[];
    gradedDetails: Array<{
        questionId: string;
        selectedOption?: string | undefined;
        correctOption: string;
        isCorrect: boolean;
        reason?: string | null | undefined;
        markedForReview: boolean;
    }>;
}

export class AnswerEvaluationService {
    /**
     * Grades student attempt answers against the private answer key.
     * Generates normalized final answers JSONB conforming to section 18.
     */
    static evaluate(
        activeAnswers: Record<string, string>,
        activeReviews: Record<string, boolean>,
        answerKey: AnswerKeyItem[],
        orderedQuestionIds: string[]
    ): EvaluationResult {
        const answerKeyMap = new Map<string, AnswerKeyItem>();
        for (const item of answerKey) {
            answerKeyMap.set(item.questionId, item);
        }

        let totalScore = 0;
        const maxScore = answerKey.length;
        const finalAnswersJSON: AttemptAnswerItem[] = [];
        const gradedDetails: EvaluationResult["gradedDetails"] = [];

        // Evaluate in deterministic order of question IDs
        const qIdsToIterate =
            orderedQuestionIds.length > 0
                ? orderedQuestionIds
                : Array.from(answerKeyMap.keys());

        for (const qId of qIdsToIterate) {
            const keyItem = answerKeyMap.get(qId);
            const selectedOpt = activeAnswers[qId];
            const isMarked = activeReviews[qId] === true;

            const itemJSON: AttemptAnswerItem = {
                questionId: qId,
                markedForReview: isMarked,
            };
            if (selectedOpt !== undefined && selectedOpt !== null && selectedOpt.trim() !== "") {
                itemJSON.selectedOption = selectedOpt.trim().toUpperCase();
            }
            finalAnswersJSON.push(itemJSON);

            if (keyItem) {
                const isCorrect =
                    itemJSON.selectedOption !== undefined &&
                    itemJSON.selectedOption === keyItem.correctOption.trim().toUpperCase();

                if (isCorrect) {
                    totalScore += 1;
                }

                gradedDetails.push({
                    questionId: qId,
                    selectedOption: itemJSON.selectedOption,
                    correctOption: keyItem.correctOption,
                    isCorrect,
                    reason: keyItem.reason,
                    markedForReview: isMarked,
                });
            }
        }

        return {
            totalScore,
            maxScore,
            finalAnswersJSON,
            gradedDetails,
        };
    }
}
