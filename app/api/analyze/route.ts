import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

function speedLabel(stimp: number): string {
  if (stimp <= 7) return 'slow — use a full, committed stroke'
  if (stimp <= 9) return 'medium — normal stroke pace'
  if (stimp <= 11) return 'fast — shorten your backstroke by 20%'
  if (stimp <= 13) return 'very fast — minimal backstroke, let gravity do the work'
  return 'tour-speed — barely touch it, trust your read'
}

function getFallbackTips(putt: { distance?: number; breakDirection?: string; greenSpeed?: number }) {
  return [
    {
      id: '1',
      type: 'info',
      title: 'Check your read',
      body: `On a ${(putt.distance ?? 10).toFixed(0)}-foot putt with ${putt.breakDirection ?? 'straight'} break, pick a clear aim point before stepping into your stance. Commit to it.`,
    },
    {
      id: '2',
      type: 'info',
      title: 'Focus on pace',
      body: `At stimp ${putt.greenSpeed ?? 10}, the green is ${speedLabel(putt.greenSpeed ?? 10)}. Adjust your backstroke length accordingly.`,
    },
  ]
}

export async function POST(req: Request) {
  let putt: Record<string, unknown> = {}
  let result: Record<string, unknown> = {}

  try {
    const body = await req.json()
    putt = body.putt ?? {}
    result = body.result ?? {}

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `You are an expert golf putting coach with 20+ years of experience.
A golfer just attempted a putt. Analyze the data and give specific, actionable coaching tips.

PUTT DATA:
- Distance: ${(putt.distance as number).toFixed(1)} feet
- Break direction: ${putt.breakDirection}
- Break intensity: ${putt.breakIntensity}/5
- Green speed (stimp): ${putt.greenSpeed}
- Aimed: ${Math.abs(putt.aimOffsetInches as number).toFixed(1)} inches ${(putt.aimOffsetInches as number) > 0 ? 'left' : 'right'} of cup

RESULT:
- Ball finished: ${(result.missDistanceInches as number).toFixed(1)} inches from cup
- Miss direction: ${result.missDirection}

Return ONLY a JSON array of exactly 3-4 coaching tips. Each tip must have:
- "type": one of "error", "warning", "success", "info"
- "title": short headline (max 8 words, sentence case)
- "body": specific actionable advice (2-3 sentences, include specific numbers)

Use "success" type if something was done well. Use "error" for the biggest mistake.
Be direct and specific — no generic advice. Reference the actual numbers from the data.

Return ONLY the JSON array, no other text.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const rawTips = JSON.parse(text)
    const tips = rawTips.map((t: { type: string; title: string; body: string }, i: number) => ({
      ...t,
      id: String(i + 1),
    }))

    return Response.json({ tips })
  } catch (error) {
    console.error('Analysis error:', error)
    return Response.json(
      { error: 'Analysis failed', tips: getFallbackTips(putt) },
      { status: 200 }
    )
  }
}
