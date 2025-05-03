// File: supabase/functions/send-instructions/index.ts (Revised Mailgun version with From Name)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { Buffer } from "https://deno.land/std@0.119.0/node/buffer.ts"; // For Base64 encoding

// Read Mailgun & Supabase environment variables (set in Supabase Dashboard - Step 2)
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN'); // Should be 'mg.befinityai.com' from your settings
const MAILGUN_API_BASE_URL = Deno.env.get('MAILGUN_API_BASE_URL'); // Should be your EU URL 'https://api.eu.mailgun.net/v3'
const FROM_EMAIL = Deno.env.get('FROM_EMAIL'); // Should be 'melvyn@befinityai.com' from your settings
const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL'); // Renamed Supabase URL variable
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY'); // Renamed Supabase service key variable

// ---- ADD THESE LOGS FOR DEBUGGING ----
console.log("DEBUG: Read MAILGUN_API_BASE_URL:", MAILGUN_API_BASE_URL);
console.log("DEBUG: Read MAILGUN_DOMAIN:", MAILGUN_DOMAIN);
// ------------------------------------

console.log('Function send-instructions (Mailgun version) started.');

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    if (dbFetchError) {
      console.error('Supabase DB Fetch Error:', dbFetchError);
      throw dbFetchError;
    }
    if (!workflowData) {
      throw new Error(`Workflow with ID ${workflow_id} not found.`);
    }
    console.log('Found workflow data.');

    // 3. Update email in DB (optional step)
    console.log('Updating email in DB...');
    const { error: dbUpdateError } = await supabaseAdmin
      .from('workflows')
      .update({ user_email: user_email })
      .eq('id', workflow_id);
    if (dbUpdateError) {
        console.error('Supabase DB Update Error (continuing anyway):', dbUpdateError);
    } else {
        console.log('Successfully updated email in DB.');
    }

    // 4. Format the email content
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
        throw new Error('Mailgun API Key, Domain, From Email, or Base URL not set in environment variables.');
    }
    // Construct the correct Mailgun API endpoint URL for sending messages
    const mailgunUrl = `<span class="math-inline">\{MAILGUN\_API\_BASE\_URL\}/</span>{MAILGUN_DOMAIN}/messages`;

    // Prepare the data payload as URL-encoded form data
    const formData = new URLSearchParams();
    // Format the 'from' field like "Display Name <email@address.com>"
    const fromAddressFormatted = `Melvyn | Befinity AI <${FROM_EMAIL}>`;
    formData.append('from', fromAddressFormatted);
    formData.append('to', user_email); // The recipient from the form
    formData.append('subject', 'Your Custom AI Workflow Instructions');
    formData.append('html', emailHtmlContent); // The HTML body of the email

    // Create the Basic Authentication header using your Mailgun API key
    const basicAuth = 'Basic ' + Buffer.from('api:' + MAILGUN_API_KEY).toString('base64');

    console.log('Calling Mailgun API at:', mailgunUrl);

    // 6. Call Mailgun API using fetch
    const mailgunResponse = await fetch(mailgunUrl, {
        method: 'POST',
        headers: {
            'Authorization': basicAuth, // Use Basic Auth
            'Content-Type': 'application/x-www-form-urlencoded', // Mailgun often prefers form data
        },
        body: formData // Send the URL-encoded form data
    });

    // 7. Handle the response from Mailgun
    if (!mailgunResponse.ok) {
        // If Mailgun returned an error status (like 400, 401, 403, 500 etc.)
        const errorBody = await mailgunResponse.text(); // Get error details from Mailgun
        console.error('Mailgun API Error:', mailgunResponse.status, errorBody);
        throw new Error(`Mailgun API request failed: ${mailgunResponse.statusText} - ${errorBody}`);
    }

    const mailgunData = await mailgunResponse.json(); // Get success data from Mailgun if needed
    console.log('Mailgun API Success:', mailgunData);

    // 8. Return a success response back to the frontend browser
    return new Response(
      JSON.stringify({ success: true, message: 'Instructions sent successfully via Mailgun!' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // OK status
      }
    );

  } catch (error) {
    // Catch any error during the process (DB fetch, Mailgun call, etc.)
    console.error('Error in send-instructions function (Mailgun):', error);
    // Return an error response back to the frontend browser
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500, // Internal Server Error status
      }
    );
  }
});