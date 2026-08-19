import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get secrets
    const N8N_BASE_URL = Deno.env.get('N8N_BASE_URL')
    const N8N_API_KEY = Deno.env.get('N8N_API_KEY')
    const ADMIN_EMAILS = Deno.env.get('ADMIN_EMAILS')

    if (!N8N_BASE_URL || !N8N_API_KEY || !ADMIN_EMAILS) {
      console.error('Missing environment variables')
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Initialize Supabase client to verify token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get user from token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if email is authorized
    const adminList = ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase())
    if (!adminList.includes(user.email?.toLowerCase() ?? '')) {
      return new Response(JSON.stringify({ error: 'Forbidden: Email not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const { action, workflowId, active, tag, mes, lancamento, receiveData } = await req.json()

    // Environment variables
    const M7_WEBHOOK_TOKEN = Deno.env.get("M7_WEBHOOK_TOKEN")


    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      if (action === 'list') {
        const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=100`, {
          method: 'GET',
          headers: {
            'X-N8N-API-KEY': N8N_API_KEY,
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`n8n API error: ${response.status} ${errorText}`)
        }

        const data = await response.json()
        const rawWorkflows = data.data || []
        const totalReceived = rawWorkflows.length
        
        // Filter out archived workflows
        const nonArchivedWorkflows = rawWorkflows.filter((w: any) => w.isArchived !== true)
        const totalExcluded = totalReceived - nonArchivedWorkflows.length

        console.log(`Workflows listados: ${totalReceived} recebidos, ${totalExcluded} excluídos (arquivados).`)
        
        // Return only requested fields
        const workflows = nonArchivedWorkflows.map((w: any) => ({
          id: w.id,
          name: w.name,
          active: w.active,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          tags: w.tags
        }))

        return new Response(JSON.stringify({ data: workflows }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else if (action === 'toggle') {
        if (!workflowId || typeof active !== 'boolean') {
          throw new Error('Invalid toggle parameters')
        }

        const endpoint = active ? 'activate' : 'deactivate'
        const safeId = encodeURIComponent(workflowId)
        
        // 1. Verify if workflow is archived before toggling
        const checkResponse = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${safeId}`, {
          method: 'GET',
          headers: {
            'X-N8N-API-KEY': N8N_API_KEY,
          },
          signal: controller.signal,
        })

        if (!checkResponse.ok) {
          const errorText = await checkResponse.text()
          throw new Error(`Error verifying workflow: ${checkResponse.status} ${errorText}`)
        }

        const workflowData = await checkResponse.json()
        if (workflowData.isArchived === true) {
          return new Response(JSON.stringify({ 
            error: 'Conflict', 
            message: 'Workflows arquivados não podem ser gerenciados por este painel' 
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // 2. Proceed with toggle
        const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${safeId}/${endpoint}`, {
          method: 'POST',
          headers: {
            'X-N8N-API-KEY': N8N_API_KEY,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`n8n API error: ${response.status} ${errorText}`)
        }

        const result = await response.json()
        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })


      } else if (action === 'update-tag') {
        if (!workflowId) {
          throw new Error('Invalid update-tag parameters')
        }

        const safeId = encodeURIComponent(workflowId)
        const n8nHeaders = {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json',
        }

        // n8n public API v1 does NOT accept tags via PATCH/PUT on the workflow.
        // Tags are managed through /workflows/{id}/tags with tag IDs.
        let tagIds: { id: string }[] = []

        const wantedTag = typeof tag === 'string' ? tag.trim() : ''
        if (wantedTag) {
          // 1. Find existing tag by name
          const tagsRes = await fetch(`${N8N_BASE_URL}/api/v1/tags?limit=250`, {
            method: 'GET',
            headers: n8nHeaders,
            signal: controller.signal,
          })
          if (!tagsRes.ok) {
            const t = await tagsRes.text()
            return new Response(JSON.stringify({ error: `n8n tags list failed: ${tagsRes.status} ${t}` }), {
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          const tagsData = await tagsRes.json()
          let found = (tagsData.data || []).find(
            (t: any) => String(t.name).trim().toLowerCase() === wantedTag.toLowerCase(),
          )

          // 2. Create it if it doesn't exist yet
          if (!found) {
            const createRes = await fetch(`${N8N_BASE_URL}/api/v1/tags`, {
              method: 'POST',
              headers: n8nHeaders,
              body: JSON.stringify({ name: wantedTag }),
              signal: controller.signal,
            })
            if (!createRes.ok) {
              const t = await createRes.text()
              return new Response(JSON.stringify({ error: `n8n tag create failed: ${createRes.status} ${t}` }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              })
            }
            found = await createRes.json()
          }

          tagIds = [{ id: found.id }]
        }

        // 3. Replace the workflow's tags (empty array removes all)
        const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${safeId}/tags`, {
          method: 'PUT',
          headers: n8nHeaders,
          body: JSON.stringify(tagIds),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          return new Response(JSON.stringify({ error: `n8n set tags failed: ${response.status} ${errorText}` }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const result = await response.json()
        clearTimeout(timeoutId)
        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })



      } else if (action === 'diagnose') {
        const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=1`, {
          method: 'GET',
          headers: { 'X-N8N-API-KEY': N8N_API_KEY },
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(`n8n API error: ${response.status}`)
        const data = await response.json()
        const firstWorkflow = data.data?.[0]
        
        const properties = firstWorkflow ? Object.keys(firstWorkflow) : []
        const parentFolderKeys = firstWorkflow?.parentFolder ? Object.keys(firstWorkflow.parentFolder) : []

        let detailedProperties: string[] = []
        if (firstWorkflow?.id) {
          const detailRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${firstWorkflow.id}`, {
            method: 'GET',
            headers: { 'X-N8N-API-KEY': N8N_API_KEY },
            signal: controller.signal,
          })
          if (detailRes.ok) {
            const detailData = await detailRes.json()
            detailedProperties = Object.keys(detailData)
          }
        }

        const foldersRes = await fetch(`${N8N_BASE_URL}/api/v1/folders`, {
          method: 'GET',
          headers: { 'X-N8N-API-KEY': N8N_API_KEY },
          signal: controller.signal,
        })

        return new Response(JSON.stringify({ 
          properties, 
          detailedProperties,
          parentFolderKeys,
          foldersEndpointStatus: foldersRes.status,
          hasParentFolderId: properties.includes('parentFolderId') || detailedProperties.includes('parentFolderId')
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else if (action === 'finance-dashboard') {
        if (!M7_WEBHOOK_TOKEN) {
          return new Response(JSON.stringify({ error: 'M7_WEBHOOK_TOKEN not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const safeCompetencia = encodeURIComponent(mes || '')
        const url = `https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-financeiro-dashboard/m7-financeiro/dashboard?competencia=${safeCompetencia}`
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-m7-token': M7_WEBHOOK_TOKEN,
          },
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)

        if (!response.ok) {
          const status = response.status
          const message = await response.text()
          return new Response(JSON.stringify({ error: 'n8n error', message, status }), {
            status: status >= 400 && status < 600 ? status : 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const data = await response.json()
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else if (action === 'finance-create') {
        if (!M7_WEBHOOK_TOKEN) {
          return new Response(JSON.stringify({ error: 'M7_WEBHOOK_TOKEN not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const response = await fetch(`https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-financeiro-lancamentos/m7-financeiro/lancamentos`, {
          method: 'POST',
          headers: {
            'x-m7-token': M7_WEBHOOK_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(lancamento),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const status = response.status
          const message = await response.text()
          return new Response(JSON.stringify({ error: 'n8n error', message, status }), {
            status: status >= 400 && status < 600 ? status : 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const data = await response.json()
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else if (action === 'finance-receive') {
        if (!M7_WEBHOOK_TOKEN) {
          return new Response(JSON.stringify({ error: 'M7_WEBHOOK_TOKEN not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const response = await fetch(`https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-financeiro-receber/m7-financeiro/receber`, {
          method: 'POST',
          headers: {
            'x-m7-token': M7_WEBHOOK_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(receiveData),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const status = response.status
          const message = await response.text()
          return new Response(JSON.stringify({ error: 'n8n error', message, status }), {
            status: status >= 400 && status < 600 ? status : 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const data = await response.json()
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else if (action === 'finance-update') {
        if (!M7_WEBHOOK_TOKEN) {
          return new Response(JSON.stringify({ error: 'M7_WEBHOOK_TOKEN not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const response = await fetch(`https://projetopessoal-n8n.h574he.easypanel.host/webhook/f50fb807-63ad-48d8-b24d-1ada58c9d5a4/m7-financeiro/editar`, {
          method: 'POST',
          headers: {
            'x-m7-token': M7_WEBHOOK_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(lancamento),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const status = response.status
          const message = await response.text()
          return new Response(JSON.stringify({ error: 'n8n error', message, status }), {
            status: status >= 400 && status < 600 ? status : 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const data = await response.json()
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } else {
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      console.error('Fetch error:', fetchError.message)
      return new Response(JSON.stringify({ error: 'Failed to communicate with n8n' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error: any) {
    console.error('Function error:', error.message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})