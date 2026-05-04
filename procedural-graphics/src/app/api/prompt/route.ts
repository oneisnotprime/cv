import { NextRequest, NextResponse } from 'next/server';
import { parsePromptToParams, buildKeywordParams } from '@/engine/prompt-parser';
import { PromptRequest } from '@/engine/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PromptRequest;
    if (!body.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const result = await parsePromptToParams(body.prompt);
    const extra = buildKeywordParams(result.algorithmId, body.prompt);
    result.params = { ...result.params, ...extra };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
