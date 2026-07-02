import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

function speedLabel(stimp: number): string {
  if (stimp <= 7) return 'slow'
  if (stimp <= 9) return 'medium'
  if (stimp <= 11) return 'fast'
  if (stimp <= 13) return 'very fast'
  return 'tour-speed'
}

const FALLBACK = {
  made: false,
  missDistanceInches: 0,
  missDirection: 'short',
  tips: [{
    id: '1',
    type: 'info',
    title: 'Keep practicing',
    body: 'Analysis unavailable. Focus on your stroke tempo and commit to your aim point on the next putt.',
  }],
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const imageBase64: string = body.image
    const putt = body.putt ?? {}

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const stimp = putt.confirmedGreenSpeed ?? putt.greenSpeed ?? 10
    const slopeLines = [
      putt.slopeDegrees !== undefined
        ? `Along-putt tilt: ${(putt.slopeDegrees as number).toFixed(1)}° (negative = uphill, positive = downhill)`
        : null,
      putt.crossSlopeDegrees !== undefined
        ? `Cross-putt tilt: ${(putt.crossSlopeDegrees as number).toFixed(1)}° (negative = left lower)`
        : null,
    ].filter(Boolean)

    const prompt = `You are an expert golf putting coach analyzing the result of a putt.

PUTT CONTEXT:
- Distance: ${(putt.distance as number ?? 10).toFixed(1)} feet
- Expected break: ${putt.breakDirection ?? 'straight'} (intensity ${putt.breakIntensity ?? 2}/5)
- Green speed: stimp ${stimp} (${speedLabel(stimp)})
- AI slope read: ${putt.slope ?? 'flat'}, grain: ${putt.grain ?? 'neutral'}${slopeLines.length ? '\n- ' + slopeLines.join('\n- ') : ''}

This photo shows where the ball ended up near the hole. The golf cup is 4.25 inches (≈ 11 cm) in diameter — use it as a scale reference to estimate miss distance.

Determine:
1. Did the ball go IN the hole? (ball inside/over the cup = made)
2. If missed: estimate inches from cup center (use cup diameter for scale)
3. Miss direction relative to the golfer who just putted: "left" | "right" | "long" (past the hole) | "short" (stopped before the hole)

Then give 3-4 specific coaching tips comparing the intended read to what actually happened.

Return ONLY valid JSON:
{
  "made": boolean,
  "missDistanceInches": number,
  "missDirection": "made" | "left" | "right" | "long" | "short",
  "tips": [
    { "type": "error"|"warning"|"success"|"info", "title": "short headline max 8 words", "body": "2-3 sentences with specific numbers and actionable advice" }
  ]
}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const data = JSON.parse(text)

    return Response.json({
      made: data.made ?? false,
      missDistanceInches: data.missDistanceInches ?? 0,
      missDirection: data.missDirection ?? 'short',
      tips: (data.tips ?? []).map((t: { type: string; title: string; body: string }, i: number) => ({
        ...t,
        id: String(i + 1),
      })),
    })
  } catch (error) {
    console.error('analyze-result error:', error)
    return Response.json(FALLBACK)
  }
}
