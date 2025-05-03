// File: supabase/functions/send-instructions/index.ts (Extra Debug Logs)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { Buffer } from "https://deno.land/std@0.119.0/node/buffer.ts";

console.log('--- Function send-instructions script loaded (Top Level) ---'); // New Log 1

Deno.serve(async (req) => {
  console.log('--- Request received by send-instructions handler ---'); // New Log 2

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('--- Attempting to read environment variables ---'); // New Log 3
  // Read Mailgun & Supabase environment variables
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
  const MAILGUN_API_BASE_URL = Deno.env.get('MAILGUN_API_BASE_URL');
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL');
  const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY');

  // ---- LOGS FOR DEBUGGING ----
  console.log("DEBUG: Read MAILGUN_API_BASE_URL:", MAILGUN_API_BASE_URL); // Keep this
  console.log("DEBUG: Read MAILGUN_DOMAIN:", MAILGUN_DOMAIN); // Keep this
  console.log("DEBUG: Read FROM_EMAIL:", FROM_EMAIL); // Log this too
  // ------------------------------------

  console.log('Function send-instructions (Mailgun version) processing...');

  try {
    // --- Rest of the try block remains the same as before ---
    // 0. Initialize Supabase Admin Client
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase URL or Service Role Key not set in environment variables.');
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase admin client initialized.');

    // 1. Get email and workflow ID from request body
    const { user_email, workflow_id } = await req.json();
    console.log('Received email:', user_email, 'and workflow ID:', workflow_id);
    if (!user_email || !workflow_id) {
      throw new Error('Email and Workflow ID are required.');
    }

    // 2. Retrieve workflow details from Database
    console.log('Fetching workflow details from DB...');
    const { data: workflowData, error: dbFetchError } = await supabaseAdmin
      .from('workflows')
      .select('original_workflow, suggested_steps')
      .eq('id', workflow_id)
      .single();

    if (dbFetchError) { throw dbFetchError; }
    if (!workflowData) { throw new Error(`Workflow with ID ${workflow_id} not found.`); }
    console.log('Found workflow data.');

    // 3. Update email in DB (optional step)
    console.log('Updating email in DB...');
    const { error: dbUpdateError } = await supabaseAdmin
      .from('workflows')
      .update({ user_email: user_email })
      .eq('id', workflow_id);
    if (dbUpdateError) { console.error('Supabase DB Update Error (continuing anyway):', dbUpdateError); }
    else { console.log('Successfully updated email in DB.'); }

    // 4. Format the email content
    // ... (email formatting code remains the same) ...
    const originalWorkflow = workflowData.original_workflow;
    const steps = workflowData.suggested_steps;
    let stepsHtml = '<ul>';
    if (Array.isArray(steps)) {
        steps.forEach(step => {
            const sanitizedStep = String(step).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            stepsHtml += `<li>${sanitizedStep}</li>`;
        });
    } else {
        stepsHtml += '<li>Could not retrieve specific steps.</li>';
    }
    stepsHtml += '</ul>';
    const emailHtmlContent = `<h1>Your AI Workflow Instructions</h1><p>Hi there,</p><p>Here are the AI-suggested steps based on your workflow:</p><p><strong>Original Workflow:</strong></p><p><span class="math-inline">\{String\(originalWorkflow\)\.replace\(/</g, "&lt;"\)\.replace\(/\>/g, "&gt;"\)\}</p\><p\><strong\>Suggested AI Steps\:</strong\></p\></span>{stepsHtml}<p>You can use these steps to guide your AI implementation.</p><p>If you have questions, feel free to reply to this email.</p><p>Best regards,<br>AI Workflow Helper</p>`;
    console.log('Formatted email content.');


    // 5. Prepare data for Mailgun API call
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !FROM_EMAIL || !MAILGUN_API_BASE_URL) {
        // This check might be hit if variables are undefined
        console.error("MAILGUN_API_KEY:", MAILGUN_API_KEY);
        console.error("MAILGUN_DOMAIN:", MAILGUN_DOMAIN);
        console.error("FROM_EMAIL:", FROM_EMAIL);
        console.error("MAILGUN_API_BASE_URL:", MAILGUN_API_BASE_URL);
        throw new Error('One or more required Mailgun environment variables are missing!');
    }
    const mailgunUrl = `<span class="math-inline">\{MAILGUN\_API\_BASE\_URL\}/</span>{MAILGUN_DOMAIN}/messages`; // URL construction
    const formData = new URLSearchParams();
    const fromAddressFormatted = `Melvyn | Befinity AI <${FROM_EMAIL}>`;
    formData.append('from', fromAddressFormatted);
    formData.append('to', user_email);
    formData.append('subject', 'Your Custom AI Workflow Instructions');
    formData.append('html', emailHtmlContent);
    const basicAuth = 'Basic ' + Buffer.from('api:' + MAILGUN_API_KEY).toString('base64');
    console.log('Calling Mailgun API at:', mailgunUrl);

    // 6. Call Mailgun API using fetch
    const mailgunResponse = await fetch(mailgunUrl, { // This is where Invalid URL happens if mailgunUrl is bad
        method: 'POST',
        headers: {
            'Authorization': basicAuth,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    });

    // 7. Handle the response from Mailgun
    // ... (response handling code remains the same) ...
     if (!mailgunResponse.ok) {
        const errorBody = await mailgunResponse.text();
        console.error('Mailgun API Error:', mailgunResponse.status, errorBody);
        throw new Error(`Mailgun API request failed: ${mailgunResponse.statusText} - ${errorBody}`);
    }
    const mailgunData = await mailgunResponse.json();
    console.log('Mailgun API Success:', mailgunData);


    // 8. Return a success response back to the frontend browser
    // ... (success response code remains the same) ...
    return new Response(
      JSON.stringify({ success: true, message: 'Instructions sent successfully via Mailgun!' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );


  } catch (error) {
    // Catch any error during the process
    console.error(`Error in send-instructions function (Mailgun): ${error.message}`); // Log specific error message
    console.error('Full error object:', error); // Log full error object
    // Return an error response back to the frontend browser
    return new Response(
      JSON.stringify({ success: false, error: `Server error: ${error.message}` }), // Send specific error message back
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});