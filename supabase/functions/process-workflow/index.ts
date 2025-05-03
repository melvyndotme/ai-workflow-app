// File: supabase/functions/process-workflow/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts' // Import shared CORS headers

// Environment variables (set in Supabase Dashboard)
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY');

console.log('Function process-workflow started.');

Deno.serve(async (req) => {
  // Handle CORS preflight requests (required for browsers)
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with SERVICE ROLE KEY for backend operations
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
       throw new Error('Supabase URL or Service Role Key not set in environment variables.');
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase admin client initialized.');

    // Get the workflow text from the incoming request
    const { workflow_text } = await req.json();
    console.log('Received workflow text:', workflow_text);
    if (!workflow_text) {
      throw new Error('Workflow text is required.');
    }

    // Construct the prompt for the OpenAI API
    const prompt = `Analyze the following user-described workflow and break it down into 3-4 distinct, actionable steps that could be augmented or automated using AI. Respond ONLY with a JSON array of strings, where each string is a step. Example response: ["Step 1 description", "Step 2 description", "Step 3 description"]. Workflow: "${workflow_text}"`;
    console.log('Constructed OpenAI prompt.');

    // Call the OpenAI API
    if (!OPENAI_API_KEY) throw new Error('OpenAI API Key not set in environment variables.');

    console.log('Calling OpenAI API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano-2025-04-14', // You can change to 'gpt-4' if preferred
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        response_format: { type: "json_object" }, // Request JSON output
      }),
    });

    // Handle OpenAI API errors
    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error('OpenAI API Error:', openaiResponse.status, errorBody);
      throw new Error(`OpenAI API request failed: ${openaiResponse.statusText} - ${errorBody}`);
    }

    const openaiData = await openaiResponse.json();
    console.log('Received OpenAI response.');

    // Extract and parse the suggested steps from the AI response
    let suggestedSteps = [];
    try {
      const responseContent = openaiData.choices?.[0]?.message?.content;
      if (!responseContent) throw new Error('No content in OpenAI response');

      // Find JSON array within the response content (handles potential markdown formatting)
      const jsonStringMatch = responseContent.match(/```json\n([\s\S]*?)\n```|(\[.*?\])/);
      let jsonString = responseContent;
      if (jsonStringMatch) {
          jsonString = jsonStringMatch[1] || jsonStringMatch[2];
      }

      suggestedSteps = JSON.parse(jsonString);
      if (!Array.isArray(suggestedSteps)) {
         throw new Error('OpenAI response content is not a valid JSON array.');
      }
      console.log('Parsed suggested steps:', suggestedSteps);

    } catch (parseError) {
       console.error('Failed to parse OpenAI response content as JSON array:', parseError);
       console.error('Raw OpenAI response content:', openaiData.choices?.[0]?.message?.content);
       throw new Error(`Could not parse steps from AI response.`);
    }

    // Save the original workflow and the parsed steps to the Supabase database
    console.log('Saving to Supabase database...');
    const { data: dbData, error: dbError } = await supabaseAdmin
      .from('workflows') // Your table name
      .insert({
         original_workflow: workflow_text,
         suggested_steps: suggestedSteps // Store the JSON array directly
        })
      .select('id') // Get the ID of the row we just inserted
      .single(); // Expect only one row

    if (dbError) {
      console.error('Supabase DB Insert Error:', dbError);
      throw dbError;
    }
    if (!dbData || !dbData.id) {
        throw new Error('Failed to retrieve ID after inserting into database.');
    }
    const workflowId = dbData.id;
    console.log('Saved to DB. New workflow ID:', workflowId);

    // Send the workflow ID and the steps back to the frontend
    return new Response(
      JSON.stringify({ workflowId: workflowId, steps: suggestedSteps }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // OK
      }
    );

  } catch (error) {
    // Handle any errors that occurred during the process
    console.error('Error in process-workflow function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500, // Internal Server Error
      }
    );
  }
});