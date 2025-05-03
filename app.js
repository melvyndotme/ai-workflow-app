// File: app.js (for index.html)

// Get references to HTML elements from index.html
const workflowForm = document.getElementById('workflow-form');
const workflowInput = document.getElementById('workflow-input');
const submitButton = document.getElementById('submit-button');
const loadingMessage = document.getElementById('loading-message');
const errorMessage = document.getElementById('error-message');

// --- Supabase details are read from the constants defined in index.html's script tag ---
// const SUPABASE_URL = '...'; // Defined in index.html
// const SUPABASE_ANON_KEY = '...'; // Defined in index.html
// const PROCESS_WORKFLOW_FUNCTION_URL = '...'; // Defined in index.html
// ------------------------------------------------------------------------------------


// Listen for when the user submits the first form (clicks "Get Suggested Steps")
workflowForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Stop the browser from doing a default form submission

    // Show loading message, hide previous errors, disable button
    loadingMessage.style.display = 'block';
    errorMessage.style.display = 'none';
    errorMessage.textContent = ''; // Clear previous error text
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';

    const workflowText = workflowInput.value; // Get the text from the textarea

    try {
        // Call your deployed Supabase Edge Function 'process-workflow'
        console.log("Sending request to:", PROCESS_WORKFLOW_FUNCTION_URL);
        const response = await fetch(PROCESS_WORKFLOW_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // We don't strictly need apikey here because we used --no-verify-jwt
                // If function security changes later, you might add: 'apikey': SUPABASE_ANON_KEY
            },
            // Send the workflow text in the request body as JSON
            body: JSON.stringify({ workflow_text: workflowText })
        });

        console.log("Received response status:", response.status);
        const responseData = await response.json(); // Read the response body as JSON

        // Check if the function returned an error (based on HTTP status or custom error field)
        if (!response.ok) {
            console.error("Function returned error:", responseData);
            // Use the error message from the function if available, otherwise use HTTP status
            throw new Error(responseData.error || `Request failed with status: ${response.status}`);
        }

        // If successful, the response should contain workflowId and steps
        console.log('Received data from function:', responseData);
        const { workflowId, steps } = responseData;

        // Validate the response data
        if (workflowId === undefined || steps === undefined) {
             console.error("Invalid response data:", responseData);
             throw new Error('Invalid response from function: missing workflowId or steps.');
        }

        // Store the results in the browser's localStorage. This is a simple way
        // to pass data between pages (index.html -> results.html).
        localStorage.setItem('workflowId', workflowId);
        localStorage.setItem('suggestedSteps', JSON.stringify(steps)); // Store steps array as a JSON string

        // Redirect the user's browser to the results page
        window.location.href = 'results.html';

    } catch (error) {
        // If anything went wrong (network issue, function error, validation error)
        console.error('Error processing workflow:', error);
        errorMessage.textContent = `Error: ${error.message}`; // Display the error message on the page
        errorMessage.style.display = 'block';

        // Re-enable the button and hide loading message so the user can try again
        submitButton.disabled = false;
        submitButton.textContent = 'Get Suggested Steps';
        loadingMessage.style.display = 'none';
    }
});