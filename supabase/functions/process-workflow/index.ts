// File: supabase/functions/process-workflow/index.ts (Restoring JSON prompt)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Read Environment Variables (Check OPENAI_API_KEY in Supabase Secrets!)
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
    console.log('Supabase admin client initialized.');

    // Get workflow text from request
    const { workflow_text } = await req.json();
    console.log('Received workflow text:', workflow_text);
    if (!workflow_text) {
      throw new Error('Workflow text is required.');
    }

    // ** Restore the prompt asking specifically for JSON **
    const prompt = `Analyze the following user-described workflow and break it down into 3-4 distinct, actionable steps that could be augmented or automated using AI. Respond ONLY with a JSON array of strings, where each string is a step. Example response: ["Step 1 description", "Step 2 description", "Step 3 description"]. Workflow: "${workflow_text}"`;
    console.log('Constructed OpenAI prompt requesting JSON array.');

    // Call OpenAI API
    if (!OPENAI_API_KEY) throw new Error('OpenAI API Key not set in environment variables.');

    console.log('Calling OpenAI API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`, // Check API Key secret is correct!
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5
        // Removed the response_format parameter as per previous step
      }),
    });

    // Handle OpenAI API errors
    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error('OpenAI API Error Response Body:', errorBody); // Log the actual error body from OpenAI
      throw new Error(`OpenAI API request failed: ${openaiResponse.statusText}`);
    }

    const openaiData = await openaiResponse.json();
    console.log('Received OpenAI response object:', JSON.stringify(openaiData)); // Log the whole response object

    // Extract and parse the suggested steps
    let suggestedSteps = [];
    try {
      const responseContent = openaiData.choices?.[0]?.message?.content;
      console.log('Raw OpenAI response content:', responseContent); // Log raw content string
      if (!responseContent) throw new Error('No content in OpenAI response message.');

      // Attempt to parse the response content string as JSON
      // Basic check: does it start/end with array brackets?
      const trimmedContent = responseContent.trim();
      if (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) {
          suggestedSteps = JSON.parse(trimmedContent); // Try parsing directly
      } else {
          // Attempt to extract from markdown if necessary (though less likely now)
          const jsonStringMatch = trimmedContent.match(/```json\n([\s\S]*?)\n```|(\[.*?\])/);
          if (jsonStringMatch) {
               let jsonString = jsonStringMatch[1] || jsonStringMatch[2];
               suggestedSteps = JSON.parse(jsonString);
          } else {
               // If it's not wrapped in brackets and not in markdown, assume it's not valid JSON array
               throw new Error('Response content is not a recognizable JSON array format.');
          }
      }

      // Final check if parsing result is actually an array
      if (!Array.isArray(suggestedSteps)) {
         throw new Error('Parsed response content is not a valid JSON array.');
      }
      console.log('Parsed suggested steps:', suggestedSteps);

    } catch (parseError) {
       // Log details if parsing fails
       console.error('Failed to parse OpenAI response content as JSON array:', parseError);
       // Raw content was already logged above
       throw new Error(`Could not parse steps from AI response. Check logs for details.`); // Throw the specific error
    }

    // Save to Supabase Database
    console.log('Saving to Supabase database...');
    const { data: dbData, error: dbError } = await supabaseAdmin
      .from('workflows')
      .insert({ original_workflow: workflow_text, suggested_steps: suggestedSteps })
      .select('id')
      .single();

    if (dbError) throw dbError;
    if (!dbData || !dbData.id) throw new Error('Failed to retrieve ID after inserting into database.');
    const workflowId = dbData.id;
    console.log('Saved to DB. New workflow ID:', workflowId);

    // Return the steps and the new workflow ID
    return new Response(
      JSON.stringify({ workflowId: workflowId, steps: suggestedSteps }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    // Catch any error during the process
    console.error(`Error in process-workflow function: ${error.message}`); // Log the specific error message
    // Also log the full error object for more details if available
    console.error('Full error object:', error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }), // Send specific error message back
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});