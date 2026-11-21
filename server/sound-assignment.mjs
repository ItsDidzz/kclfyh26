import { createServer } from 'node:http'

const port = Number(process.env.SOUND_ASSIGNMENT_PORT ?? 8787)
const allowedInstruments = ['marimba', 'bass', 'chime', 'pluck', 'drum', 'shaker']
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', corsOrigin)
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end()
    return
  }

  if (request.method !== 'POST' || request.url !== '/api/sound-assignment') {
    response.writeHead(404).end()
    return
  }

  const body = await readJsonBody(request)
  if (!body || typeof body.label !== 'string' || body.label.length > 100) {
    respondJson(response, 400, { error: 'A detected object label is required.' })
    return
  }

  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    respondJson(response, 500, { error: 'Set OPENAI_API_KEY and OPENAI_MODEL before starting the sound service.' })
    return
  }

  try {
    const assignment = await requestAssignment(body.label)
    respondJson(response, 200, assignment)
  } catch (error) {
    respondJson(response, 502, { error: error instanceof Error ? error.message : 'The sound assignment service failed.' })
  }
})

server.listen(port, () => {
  console.log(`Sound assignment service listening on http://localhost:${port}`)
})

async function requestAssignment(label) {
  const modelResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      input: [
        {
          role: 'developer',
          content: 'Assign an instrument to a detected object based on its visual and cultural vibe. Choose exactly one permitted instrument. Marimba is warm and playful, bass is grounded and heavy, chime is bright and delicate, pluck is a bright string, drum is a deep thud, shaker is a short rattle.',
        },
        { role: 'user', content: `Detected object: ${label}` },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'sound_assignment',
          strict: true,
          schema: {
            type: 'object',
            properties: { instrument: { type: 'string', enum: allowedInstruments } },
            required: ['instrument'],
            additionalProperties: false,
          },
        },
      },
    }),
  })

  if (!modelResponse.ok) throw new Error(`LLM request failed with status ${modelResponse.status}.`)

  const payload = await modelResponse.json()
  const assignment = JSON.parse(payload.output_text)
  if (!allowedInstruments.includes(assignment.instrument)) throw new Error('LLM returned an unsupported instrument.')
  return assignment
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve(null)
      }
    })
  })
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(payload))
}
