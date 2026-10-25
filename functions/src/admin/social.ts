// ============================================================================
// admin/social.ts
// Newsy, komunikaty, ankiety
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Tworzy nowy news w węźle `news/{newsId}`.
 */
export const createNews = onCall(
  { cors: true },
  async (request) => {
    const { title, content, authorId } = request.data as {
      title: string;
      content: string;
      authorId?: string;
    };

    if (!title || !content) {
      throw new Error("Missing required parameters: title, content");
    }

    const dbRef = db();
    const newsRef = dbRef.ref("news").push();
    await newsRef.set({
      title,
      content,
      authorId: authorId ?? null,
      createdAt: Date.now(),
      published: true,
    });

    return { ok: true, newsId: newsRef.key };
  }
);

/**
 * Publikuje/ukrywa news.
 */
export const toggleNewsVisibility = onCall(
  { cors: true },
  async (request) => {
    const { newsId, published } = request.data as {
      newsId: string;
      published: boolean;
    };

    if (!newsId || published === undefined) {
      throw new Error("Missing required parameters: newsId, published");
    }

    const dbRef = db();
    await dbRef.ref(`news/${newsId}`).update({ published });

    return { ok: true, newsId, published };
  }
);

/**
 * Tworzy ankietę w węźle `polls/{pollId}`.
 */
export const createPoll = onCall(
  { cors: true },
  async (request) => {
    const { question, options } = request.data as {
      question: string;
      options: string[];
    };

    if (!question || !options || options.length < 2) {
      throw new Error(
        "Missing required parameters: question, options (min 2)"
      );
    }

    const dbRef = db();
    const pollRef = dbRef.ref("polls").push();

    const votes: Record<string, number> = {};
    for (const opt of options) votes[opt] = 0;

    await pollRef.set({
      question,
      options,
      votes,
      createdAt: Date.now(),
      active: true,
    });

    return { ok: true, pollId: pollRef.key };
  }
);