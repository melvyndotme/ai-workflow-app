// File: supabase/functions/send-instructions/index.ts (Final Mailgun Version - Includes 2nd AI Call)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { Buffer } from "https://deno.land/std@0.119.0/node/buffer.ts"; // For Base64 encoding

// Read Environment Variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY'); // Needed for the second API call
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
const MAILGUN_API_BASE_URL = Deno.env.get('MAILGUN_API_BASE_URL');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL');
const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY');

console.log('Function send-instructions (Mailgun + System Prompt Gen) started.');

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  let mailgunUrl;

  // --- Check Environment Variables ---
  try {
      console.log('Checking required environment variables...');
      // Check all needed keys, including OpenAI key for the second call
      if (!OPENAI_API_KEY || !MAILGUN_API_KEY || !MAILGUN_DOMAIN || !FROM_EMAIL || !MAILGUN_API_BASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          console.error("Missing Environment Variables! Check Supabase Secrets.");
          // Log details if needed
          console.error("OPENAI_API_KEY exists:", !!OPENAI_API_KEY);
          console.error("MAILGUN_API_KEY exists:", !!MAILGUN_API_KEY);
          console.error("MAILGUN_DOMAIN:", MAILGUN_DOMAIN);
          console.error("MAILGUN_API_BASE_URL:", MAILGUN_API_BASE_URL);
          console.error("FROM_EMAIL:", FROM_EMAIL);
          console.error("SUPABASE_URL:", SUPABASE_URL);
          console.error("SUPABASE_SERVICE_ROLE_KEY exists:", !!SUPABASE_SERVICE_ROLE_KEY);
          throw new Error('One or more required environment variables are missing!');
      }
      // Construct Mailgun URL
      mailgunUrl = `${MAILGUN_API_BASE_URL}/${MAILGUN_DOMAIN}/messages`;
      new URL(mailgunUrl); // Validate URL structure
      console.log('Environment variables checked and Mailgun URL constructed:', mailgunUrl);

  } catch (envError) {
       console.error("!!! ERROR during environment variable reading or URL construction !!!");
       console.error("Error message:", envError.message);
       return new Response(
         JSON.stringify({ success: false, error: `Server setup error: ${envError.message}` }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
       );
  }
  // --- End Environment Variable Check ---


  // --- Main Function Logic ---
  try {
    console.log('Starting main processing...');
    // 0. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get email/workflow ID
    const { user_email, workflow_id } = await req.json();
    if (!user_email || !workflow_id) { throw new Error('Email/Workflow ID required.'); }
    console.log('Received email:', user_email, 'id:', workflow_id);

    // 2. Retrieve details (including the 4 steps array)
    console.log('Fetching workflow details...');
    const { data: workflowData, error: dbFetchError } = await supabaseAdmin.from('workflows').select('original_workflow, suggested_steps').eq('id', workflow_id).single();
    if (dbFetchError) { throw dbFetchError; } if (!workflowData) { throw new Error(`Workflow ${workflow_id} not found.`); }
    const originalInput = workflowData.original_workflow;
    const stepsArray = workflowData.suggested_steps; // This is the array of 4 steps

    // 3. Update email in DB (Optional)
    console.log('Updating email in DB...');
    const { error: dbUpdateError } = await supabaseAdmin.from('workflows').update({ user_email: user_email }).eq('id', workflow_id);
    if (dbUpdateError) { console.error('DB Update Error:', dbUpdateError); /* Continue anyway */ }

    // --- STAGE 2: GENERATE SYSTEM PROMPT ---
    console.log('Preparing to generate system prompt from steps...');
    if (!Array.isArray(stepsArray) || stepsArray.length < 4) { // Check we have the steps needed
      throw new Error("Could not retrieve the 4 required steps for system prompt generation.");
    }

    // Construct the prompt for the second OpenAI call
    const promptForSystemPrompt = `
You are an expert assistant that generates system prompts for custom AI agents (like Custom GPTs, Copilot Agents, Gemini Gems). Your sole focus is creating agents that *assist* users with their workflows, acting as intelligent assistants.
Based on the user's original workflow request ("${originalInput}") and the key actionable steps derived for AI *assistance*, create a comprehensive system prompt. **Under no circumstances should the generated prompt suggest full automation or replacement of the user.** The agent's role is strictly supportive and assistive.

The key actionable steps identified for AI assistance are:
1. ${stepsArray[0]}
2. ${stepsArray[1]}
3. ${stepsArray[2]}
4. ${stepsArray[3]}

Generate the system prompt using the following structure and guidelines ONLY, ensuring all language strictly reflects user assistance and avoids any implication of automation:

**Role:**
Define the AI agent's role EXCLUSIVELY as an intelligent assistant helping the user with the specified workflow. Include:
- Roles and Responsibilities: Detail the specific tasks the agent performs to *assist* the user or *prepare information for the user* based on the 4 workflow steps above. DO NOT describe tasks as automated or autonomous. Frame responsibilities around supporting the user's execution of the step.
- Knowledge and Skills Expected: Specify the expertise needed for these *assistance* tasks (e.g., analysis, drafting, formatting based on input).
- Experience Required: Detail relevant practical knowledge for *assisting* with the steps effectively.

**Context:**
Describe how the agent should interact to provide assistance. It must:
- Understand user requests related to the 4 steps and offer appropriate help.
- Ask clarifying questions politely to ensure it provides the correct *assistance* and has the necessary input from the user.
- Explain its assistance process clearly, avoiding technical jargon. Assume interaction and input from the user are required unless a step is purely informational generation (like summarizing provided text).

**Instructions:**
Provide clear, step-by-step guidance for the agent on how to *execute its assistance tasks* for each of the 4 workflow steps, assuming user interaction. Use Chain-of-Thought principles:
- Break down each step into sub-tasks focused on AI *support* (e.g., "Wait for user to provide [data/input]", "Analyze the provided [data/input]", "Draft content based on analysis and user requirements", "Extract relevant data points for user review", "Format document according to user request", "Present draft/findings to the user for feedback/approval").
- Present instructions sequentially.
- Use plain, direct language focused on *assisting* the user. ABSOLUTELY AVOID terms like "automate", "automatically", "replace user", "do the task". Focus on actions like "draft", "analyze", "suggest", "format", "organize for", "summarize for".

**Constraints:**
Define the agent's operational boundaries as an assistant:
- Function Only as Assistant: Explicitly state the agent assists and requires user input or direction for tasks; it does not perform tasks autonomously start-to-finish.
- Do Not Hallucinate: Base assistance strictly on the defined workflow steps and provided user context.
- Avoid Speculation: Do not guess user intent; ask for clarification.
- No Misinformation: Ensure accuracy in the assistance provided.
* Clear Communication: Be straightforward about capabilities and what input is needed from the user.
- Stay Focused on Assistance: Operate only within the scope of assisting with the defined 4-step workflow.

Produce ONLY the system prompt text, formatted clearly with the markdown headings: **Role:**, **Context:**, **Instructions:**, and **Constraints:**. Ensure no language implies full automation.
`;

    // Make the second OpenAI call
    console.log("Calling OpenAI API (Stage 2) to generate system prompt...");
    const systemPromptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`, // Use the OpenAI key
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4.1-nano', // Use a model suitable for potentially longer prompts/responses if needed
            messages: [{ role: 'user', content: promptForSystemPrompt }],
            temperature: 0.5,
        }),
    });

    if (!systemPromptResponse.ok) {
        const errorBody = await systemPromptResponse.text();
        console.error('OpenAI System Prompt API Error:', systemPromptResponse.status, errorBody);
        throw new Error(`OpenAI API request (for system prompt) failed: ${systemPromptResponse.statusText}`);
    }

    const systemPromptData = await systemPromptResponse.json();
    const generatedSystemPrompt = systemPromptData.choices?.[0]?.message?.content;

    if (!generatedSystemPrompt) {
        throw new Error("Failed to get system prompt content from OpenAI response.");
    }
    console.log("Generated System Prompt received from OpenAI.");
    // --- END STAGE 2 ---


    // 4. Format Email (using the generatedSystemPrompt)
    console.log('Formatting email content with system prompt...');
    const emailHtmlContent = `
    <div style="font-family: sans-serif; line-height: 1.6;">
        <h1>Congratulations!</h1>
        <p>You've taken the first step in turning AI into your <strong>Intelligent Assistant</strong>!</p>
        <p>Based on your workflow, "${originalInput.replace(/</g, "&lt;").replace(/>/g, "&gt;")}", our <strong>AI Workflow Builder</strong> has generated the <strong>custom instructions</strong> — a ready-to-use chain-of-thought prompt that you can use in:</p>
        <ul style="list-style-type: disc; margin-left: 20px;">
            <li>ChatGPT (as a custom GPT or just a one-time prompt)</li>
            <li>Copilot (inside Microsoft 365)</li>
            <li>Gems (within Google Gemini)</li>
        </ul>
        <p>These custom instructions give AI <strong>your logic</strong>.</p>

        <br>
        <br>

        <h2>Your custom instructions:</h2>
        <pre style="white-space: pre-wrap; background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-family: monospace; border: 1px solid #eee;">${generatedSystemPrompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>

        <br>
        <br>

        <h2>What to do with the custom instructions?</h2>
        <ul style="list-style-type: disc; margin-left: 20px;">
            <li>Paste it into the instructions for Custom GPT, Copilot Agent, or Gemini Gem</li>
            <li>Instruct AI to follow your logic</li>
            <li>Use it to turn AI into your <strong>Intelligent Assistant</strong></li>
        </ul>

        <br>
        <br>

        <h2>Why Build Your Own Intelligent Assistant?</h2>
        <p>Because when AI follows <strong>your logic</strong>, you’re not just automating tasks.<br>
        You’re scaling <strong>how</strong> you think.<br>
        And that’s where real <strong>leverage</strong> lives.</p>

        <p>Should you have any questions, feel free to hit "Reply". I'm here to help!</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

        <p style="font-size: small; color: #121212; line-height: 1.5;">
        <p>Keep building.<br>
        <strong>—Melvyn Tan</strong><br>
        <i>Co-Founder, Befinity AI</i><br>
        ~~~<br>
        Email: <a href="mailto:melvyn@befinityai.com" style="color: #666; text-decoration: none;">melvyn@befinityai.com</a><br>
        Web: <a href="https://befinityai.com" target="_blank" style="color: #666; text-decoration: none;">befinityai.com</a><br>
        Phone: <a href="tel:+6591120032" style="color: #666; text-decoration: none;">+65 911-200-32</a><br>
        WhatsApp: <a href="https://wa.me/6586880032" target="_blank" style="color: #666; text-decoration: none;">+65 868-800-32</a><br>
        Address: 60 Paya Lebar Road, #07-54, Paya Lebar Square, Singapore 409051<br>
        ~~~<br>
        Unless we agree otherwise, this conversation remains confidential.
        </p>
    </div>
`;

    // 5. Prepare Mailgun data (using the generated system prompt in the body)
    const formData = new URLSearchParams();
    const fromAddressFormatted = `Melvyn | Befinity AI <${FROM_EMAIL}>`;
    formData.append('from', fromAddressFormatted);
    formData.append('to', user_email);
    formData.append('subject', 'Your Custom Instructions Are Ready!'); // Updated subject
    formData.append('html', emailHtmlContent);
    const basicAuth = 'Basic ' + Buffer.from('api:' + MAILGUN_API_KEY).toString('base64');
    console.log('Calling Mailgun API at:', mailgunUrl);

    // 6. Call Mailgun API
    const mailgunResponse = await fetch(mailgunUrl, {
        method: 'POST',
        headers: { 'Authorization': basicAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
    });

    // 7. Handle Mailgun Response
     if (!mailgunResponse.ok) { const errorBody = await mailgunResponse.text(); console.error('Mailgun API Error:', mailgunResponse.status, errorBody); throw new Error(`Mailgun API request failed: ${mailgunResponse.statusText} - ${errorBody}`); }
     const mailgunData = await mailgunResponse.json();
     console.log('Mailgun API Success:', mailgunData.message);

    // 8. Return success response
     return new Response( JSON.stringify({ success: true, message: 'System prompt sent successfully via Mailgun!' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 } );

  } catch (error) {
    // Catch errors from main logic
    console.error(`Error in send-instructions main logic: ${error.message}`);
    console.error('Full error object:', error);
    return new Response(
      JSON.stringify({ success: false, error: `Server processing error.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});