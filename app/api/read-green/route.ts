import Anthropic from '@anthropic-ai/sdk'
import { GreenAnalysis } from '@/lib/types'

export const maxDuration = 30

const FALLBACK: GreenAnalysis = {
  breakDirection: 'straight',
  breakIntensity: 2,
  greenSpeed: 10,
  slope: 'flat',
  grain: 'neutral',
  confidence: 30,
  notes: 'Analysis unavailable — using defaults',
}

export async function POST(req: Request) {
  let ballPos = { x: 0.5, y: 0.8 }
  let holePos = { x: 0.5, y: 0.2 }
  let imageBase64 = ''

  try {
    const body = await req.json()
    imageBase64 = body.image
    ballPos = body.ballPos ?? ballPos
    holePos = body.holePos ?? holePos
    const distanceFt: number | undefined = body.distanceFt
    const fromHole: boolean = body.perspective === 'from_hole'

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const contextLine = fromHole
      ? `The golfer is STANDING AT THE HOLE looking back toward their ball${distanceFt ? `, which is ${distanceFt.toFixed(1)} feet away` : ''}. The bottom of this image is the hole location. Break direction is relative to the golfer at the ball looking toward the hole (not your current viewing direction).`
      : `The golfer's ball is at image position (${ballPos.x.toFixed(2)}, ${ballPos.y.toFixed(2)}) and the hole is at (${holePos.x.toFixed(2)}, ${holePos.y.toFixed(2)}), where (0,0) is top-left and (1,1) is bottom-right.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: `You are an expert golf caddie reading a putting green from a phone camera.

${contextLine}

Analyze the image and return ONLY valid JSON (no markdown, no explanation):
{
  "breakDirection": "left" | "right" | "straight",
  "breakIntensity": 1 to 5,
  "greenSpeed": 6 to 14,
  "slope": "uphill" | "downhill" | "flat",
  "grain": "with" | "against" | "neutral",
  "confidence": 0 to 100,
  "notes": "one sentence describing the key read"
}

Base your read on: visible contours, grass color/texture gradients, shadows, grain sheen, surrounding terrain. If the image is too unclear, use confidence below 40 and sensible defaults.`,
            },
          ],
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const analysis: GreenAnalysis = JSON.parse(text)
    return Response.json({ analysis })
  } catch (error) {
    console.error('Green reading error:', error)
    return Response.json({ analysis: FALLBACK })
  }
}
