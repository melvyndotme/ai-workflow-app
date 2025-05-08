// File: supabase/functions/process-workflow/index.ts (Final Version)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Read Environment Variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL'); // Use renamed variable
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY'); // Use renamed variable

console.log('Function process-workflow started.');

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
       throw new Error('Supabase URL or Service Role Key not set in environment variables.');
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get workflow text from request
    const { workflow_text } = await req.json();
    if (!workflow_text) {
      throw new Error('Workflow text is required.');
    }

    // New prompt STRICTLY focused on AI assistance
    const prompt = `Analyze the user's workflow described below. Identify exactly 4 distinct ways an AI assistant could *help* the user perform parts of this workflow more effectively or easily. Describe these 4 assistance steps clearly and actionably. Keep the steps concise, logical, and sequential, focusing *only* on how the AI assists the user, not on replacing the user or fully automating tasks. Respond ONLY with a JSON array of strings containing these 4 assistance-focused steps. Example response: ["AI assists by drafting summaries from notes", "AI helps identify key data points for user review", "AI aids in formatting the report sections based on input", "AI assists with checking provided text for inconsistencies"]. Workflow: "${workflow_text}"`;

    // Call OpenAI API
    if (!OPENAI_API_KEY) {
        console.error('OpenAI API Key is not set in environment variables.');
        throw new Error('OpenAI API Key is missing.');
    }

    console.log('Calling OpenAI API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5
        // No response_format parameter needed here, rely on prompt
      }),
    });

    // Handle OpenAI API errors
    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error('OpenAI API Error Response Body:', errorBody);
      throw new Error(`OpenAI API request failed: ${openaiResponse.statusText}`);
    }

    const openaiData = await openaiResponse.json();

    // Extract and parse the suggested steps
    let suggestedSteps = [];
    try {
      const responseContent = openaiData.choices?.[0]?.message?.content;
      if (!responseContent) {
          console.error('No content found in OpenAI response message.');
          throw new Error('No content in OpenAI response message.');
      }

      console.log('Attempting to parse raw OpenAI content:', responseContent);
      const trimmedContent = responseContent.trim();
      // Try parsing directly if it looks like an array, otherwise try extracting from markdown
      if (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) {
          suggestedSteps = JSON.parse(trimmedContent);
      } else {
          const jsonStringMatch = trimmedContent.match(/```json\n([\s\S]*?)\n```|(\[.*?\])/);
          if (jsonStringMatch) {
               let jsonString = jsonStringMatch[1] || jsonStringMatch[2];
               suggestedSteps = JSON.parse(jsonString);
          } else {
               throw new Error('Response content is not a recognizable JSON array format.');
          }
      }

      // Final check if parsing result is actually an array
      if (!Array.isArray(suggestedSteps)) {
         throw new Error('Parsed response content is not a valid JSON array.');
      }
      console.log('Successfully parsed steps.');

    } catch (parseError) {
       console.error('Failed to parse OpenAI response content as JSON array:', parseError);
       // Include the raw content in the error thrown back if parsing fails
       throw new Error(`Could not parse steps from AI response. Raw content: ${openaiData.choices?.[0]?.message?.content}`);
    }

    // Save to Supabase Database
    console.log('Saving to Supabase database...');
    const { data: dbData, error: dbError } = await supabaseAdmin
      .from('workflows')
      .insert({ original_workflow: workflow_text, suggested_steps: suggestedSteps })
      .select('id')
      .single();

    if (dbError) {
        console.error('Supabase DB Insert Error:', dbError);
        throw dbError;
    }
    if (!dbData || !dbData.id) {
        throw new Error('Failed to retrieve ID after inserting into database.');
    }
    const workflowId = dbData.id;
    console.log('Saved to DB. New workflow ID:', workflowId);

    // Return the steps and the new workflow ID
    return new Response(
      JSON.stringify({ workflowId: workflowId, steps: suggestedSteps }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    // Catch any error during the process
    console.error(`Error in process-workflow function: ${error.message}`);
    console.error('Full error object:', error); // Log full error for debugging
    // Return a generic server error message to the frontend
    return new Response(
      JSON.stringify({ error: `Server error processing workflow.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});