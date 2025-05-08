// File: app.js (Final Version)
const workflowForm = document.getElementById('workflow-form');
const workflowInput = document.getElementById('workflow-input');
const submitButton = document.getElementById('submit-button');
const loadingMessage = document.getElementById('loading-message');
const errorMessage = document.getElementById('error-message');

// Constants PROJECT_SUPABASE_URL, SUPABASE_ANON_KEY, PROCESS_WORKFLOW_FUNCTION_URL
// are expected to be defined in index.html <script> tag before this script is loaded

workflowForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent default page reload on form submission

    // Update UI to show loading state
    loadingMessage.style.display = 'block';
    errorMessage.style.display = 'none'; // Hide previous errors
    errorMessage.textContent = ''; // Clear previous error text
    submitButton.disabled = true; // Disable button during processing
    submitButton.textContent = 'Processing...';

    const workflowText = workflowInput.value; // Get user's workflow description

    try {
        // Ensure the function URL constant exists (defined in index.html)
        if (typeof PROCESS_WORKFLOW_FUNCTION_URL === 'undefined' || !PROCESS_WORKFLOW_FUNCTION_URL) {
             throw new Error("Configuration error: Process function URL not set in index.html.");
        }

        console.log("Sending request to:", PROCESS_WORKFLOW_FUNCTION_URL);
        // Call the backend function to process the workflow
        const response = await fetch(PROCESS_WORKFLOW_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Include anon key if function security requires it (not needed with --no-verify-jwt setup)
                // 'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ workflow_text: workflowText }) // Send workflow text in JSON body
        });

        console.log("Received response status:", response.status);
        const responseData = await response.json(); // Get the JSON response body

        // Check if the function returned an error
        if (!response.ok) {
            console.error("Function returned error:", responseData);
            // Throw an error with the message from the backend if available
            throw new Error(responseData.error || `Request failed with status: ${response.status}. Check server logs.`);
        }

        console.log('Received data from function:', responseData);
        const { workflowId, steps } = responseData; // Extract data from response

        // Validate received data
        if (workflowId === undefined || steps === undefined) {
             console.error("Invalid response data received from function:", responseData);
             throw new Error('Invalid response from function: missing workflowId or steps.');
        }

        // Store results in the browser's localStorage to pass to the next page
        localStorage.setItem('workflowId', workflowId);
        localStorage.setItem('suggestedSteps', JSON.stringify(steps)); // Store steps array as a JSON string
        localStorage.setItem('originalWorkflow', workflowText); // Also store the original text for display

        // Redirect the user's browser to the results page
        window.location.href = 'results.html';

    } catch (error) {
        // Handle any errors during the fetch or processing
        console.error('Error processing workflow:', error);
        // Display a user-friendly error message on the page
        errorMessage.textContent = `Error: ${error.message.includes('Failed to fetch') ? 'Network error or function unavailable.' : error.message}`;
        errorMessage.style.display = 'block';

        // Restore button state
        submitButton.disabled = false;
        submitButton.textContent = 'Get Suggested Steps';
        loadingMessage.style.display = 'none'; // Hide loading message
    }
});