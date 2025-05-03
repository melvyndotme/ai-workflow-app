// File: supabase/functions/send-instructions/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Environment variables (set in Supabase Dashboard)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL'); // The email verified with Resend

console.log('Function send-instructions started.');

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with SERVICE ROLE KEY
     if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
       throw new Error('Supabase URL or Service Role Key not set in environment variables.');
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase admin client initialized.');

    // Get the user's email and the workflow ID from the incoming request
    const { user_email, workflow_id } = await req.json();
    console.log('Received email:', user_email, 'and workflow ID:', workflow_id);
    if (!user_email || !workflow_id) {
      throw new Error('Email and Workflow ID are required.');
    }

    // Retrieve the saved workflow details from the database using the ID
    console.log('Fetching workflow details from DB...');
    const { data: workflowData, error: dbFetchError } = await supabaseAdmin
      .from('workflows') // Your table name
      .select('original_workflow, suggested_steps')
      .eq('id', workflow_id) // Find the row matching the ID
      .single(); // Expect exactly one result

    if (dbFetchError) {
      console.error('Supabase DB Fetch Error:', dbFetchError);
      throw dbFetchError;
    }
    if (!workflowData) {
      throw new Error(`Workflow with ID ${workflow_id} not found.`);
    }
    console.log('Found workflow data:', workflowData);

    // Update the database record to include the user's email address
    console.log('Updating email in DB...');
    const { error: dbUpdateError } = await supabaseAdmin
      .from('workflows')
      .update({ user_email: user_email }) // Set the user_email column
      .eq('id', workflow_id); // For the matching row

    if (dbUpdateError) {
      // Log the error, but continue to try sending the email
      console.error('Supabase DB Update Error (continuing anyway):', dbUpdateError);
    } else {
      console.log('Successfully updated email in DB.');
    }

    // Format the email content using the retrieved data
    const originalWorkflow = workflowData.original_workflow;
    const steps = workflowData.suggested_steps; // This is the JSON array

    let stepsHtml = '<ul>';
    if (Array.isArray(steps)) {
        steps.forEach(step => {
            // Basic sanitization for HTML display
            const sanitizedStep = String(step).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            stepsHtml += `<li>${sanitizedStep}</li>`;
        });
    } else {
        stepsHtml += '<li>Could not retrieve specific steps.</li>';
    }
    stepsHtml += '</ul>';

    const emailHtmlContent = `
      <h1>Your AI Workflow Instructions</h1>
      <p>Hi there,</p>
      <p>Here are the AI-suggested steps based on your workflow:</p>
      <p><strong>Original Workflow:</strong></p>
      <p>${originalWorkflow.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      <p><strong>Suggested AI Steps:</strong></p>
      ${stepsHtml}
      <p>Use these steps to guide your AI implementation.</p>
      <p>Best regards,<br>Your AI Workflow Helper</p>
    `;
    console.log('Formatted email content.');

    // Call the Resend API to send the email
    if (!RESEND_API_KEY) throw new Error('Resend API Key not set.');
    if (!FROM_EMAIL) throw new Error('From Email address not set.');

    console.log('Calling Resend API...');
    const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: FROM_EMAIL, // Your verified sender email address
            to: [user_email], // Resend expects an array of recipients
            subject: 'Your Custom AI Workflow Instructions',
            html: emailHtmlContent, // The HTML content we created
        }),
    });

    // Handle Resend API errors
    if (!resendResponse.ok) {
        const errorBody = await resendResponse.text();
        console.error('Resend API Error:', resendResponse.status, errorBody);
        throw new Error(`Resend API request failed: ${resendResponse.statusText} - ${errorBody}`);
    }

    const resendData = await resendResponse.json();
    console.log('Resend API Success:', resendData);

    // Send a success response back to the frontend
    return new Response(
      JSON.stringify({ success: true, message: 'Instructions sent successfully!' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // OK
      }
    );

  } catch (error) {
    // Handle any errors that occurred
    console.error('Error in send-instructions function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500, // Internal Server Error
      }
    );
  }
});