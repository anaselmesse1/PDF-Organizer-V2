 // Create error handler for script loading
        function handleScriptError(scriptSrc, callback) {
            const script = document.createElement('script');
            script.src = scriptSrc;
            script.crossOrigin = "anonymous"; // Add CORS attribute
            script.onload = callback;
            script.onerror = function(e) {
                console.error("Script loading error:", scriptSrc);
                // Create a user-friendly error message
                const errorMsg = document.createElement('div');
                errorMsg.style.padding = '20px';
                errorMsg.style.color = '#e63946';
                errorMsg.style.textAlign = 'center';
                errorMsg.style.backgroundColor = 'rgba(230, 57, 70, 0.1)';
                errorMsg.style.margin = '20px';
                errorMsg.style.borderRadius = '8px';
                errorMsg.innerHTML = `
                    <strong>Error:</strong> Failed to load PDF processing library from ${scriptSrc}.<br>
                    <p>This may be due to network issues or content blocking.</p>
                    <button onclick="location.reload()" style="background: #e63946; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-top: 10px; cursor: pointer;">
                        Refresh Page
                    </button>
                `;
                document.body.prepend(errorMsg);
                
                // Try loading from alternative CDN sources
                if (scriptSrc.includes('cdnjs')) {
                    console.log("Attempting to load from alternative source");
                    const newSrc = scriptSrc.replace('cdnjs.cloudflare.com', 'cdn.jsdelivr.net/npm');
                    setTimeout(() => handleScriptError(newSrc, callback), 1000);
                }
            };
            document.head.appendChild(script);
            return script;
        }
        
        // Load scripts in sequence with error handling and retry mechanism
        function loadLibraries() {
            handleScriptError("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js", function() {
                handleScriptError("https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js", function() {
                    // Set up the PDF.js worker after main script loads successfully
                    if (typeof pdfjsLib !== 'undefined') {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                    }
                });
            });
        }
        
        // Start loading the libraries
        loadLibraries();
   
        // App state
        const state = {
            pdfDocument: null,
            pdfBytes: null,
            currentPage: 0,
            totalPages: 0,
            scale: 2.0, // Higher scale for better quality
            pdfHistory: [],
            historyIndex: -1,
            isDragging: false,
            draggedElement: null,
            dropTarget: null
        };

        // DOM Elements
        const uploadBtn = document.getElementById('upload-btn');
        const fileInput = document.getElementById('pdf-upload');
        const thumbnailContainer = document.getElementById('thumbnail-container');
        const viewerContainer = document.getElementById('viewer-container');
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        const downloadBtn = document.getElementById('download-btn');
        const messageBox = document.getElementById('message-box');

        // Event Listeners
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileUpload);
        undoBtn.addEventListener('click', undo);
        redoBtn.addEventListener('click', redo);
        downloadBtn.addEventListener('click', downloadPDF);
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key) {
                case 'ArrowLeft':
                    if (state.currentPage > 1) {
                        selectPage(state.currentPage - 1);
                    }
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    if (state.currentPage < state.totalPages) {
                        selectPage(state.currentPage + 1);
                    }
                    e.preventDefault();
                    break;
                case 'Home':
                    if (state.totalPages > 0) {
                        selectPage(1);
                    }
                    e.preventDefault();
                    break;
                case 'End':
                    if (state.totalPages > 0) {
                        selectPage(state.totalPages);
                    }
                    e.preventDefault();
                    break;
                case '+':
                case '=':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (state.scale < 3.0) {
                            state.scale += 0.25;
                            renderPage(state.currentPage);
                            showMessage(`Zoom: ${Math.round(state.scale * 100)}%`);
                        }
                    }
                    break;
                case '-':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (state.scale > 0.5) {
                            state.scale -= 0.25;
                            renderPage(state.currentPage);
                            showMessage(`Zoom: ${Math.round(state.scale * 100)}%`);
                        }
                    }
                    break;
                case '0':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        state.scale = 2.0;
                        renderPage(state.currentPage);
                        showMessage('Zoom reset to 200%');
                    }
                    break;
                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            redo();
                        } else {
                            undo();
                        }
                    }
                    break;
                case 'o':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        document.getElementById('pdf-upload').click();
                    }
                    break;
                case 's':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        downloadPDF();
                    }
                    break;
                case 'Delete':
                case 'Backspace':
                    if (state.totalPages > 1 && state.currentPage > 0) {
                        if (confirm(`Delete page ${state.currentPage}?`)) {
                            deletePage(state.currentPage);
                        }
                    }
                    e.preventDefault();
                    break;
                case 'r':
                    if (state.currentPage > 0) {
                        rotatePage(state.currentPage);
                    }
                    e.preventDefault();
                    break;
            }
        });

        // Variables to track drag source
        let isDragFromOutside = false;
        let isDragFromThumbnail = false;
        
        // Add custom CSS for navigation buttons
        const navButtonStyles = document.createElement('style');
        navButtonStyles.textContent = `
            .page-navigation {
                position: absolute;
                bottom: 20px;
                left: 0;
                right: 0;
                display: flex;
                justify-content: center;
                gap: 20px;
                z-index: 10;
                transition: opacity 0.3s ease;
            }
            
            .nav-btn {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: rgba(67, 97, 238, 0.9);
                color: white;
                border: none;
                font-size: 24px;
                cursor: pointer;
                box-shadow: var(--shadow-md);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .nav-btn:hover:not(:disabled) {
                transform: scale(1.1);
                background: var(--color-primary);
            }
            
            .nav-btn:active:not(:disabled) {
                transform: scale(0.95);
            }
            
            .nav-btn:disabled {
                background: rgba(173, 181, 189, 0.8);
                cursor: not-allowed;
                opacity: 0.7;
            }
            
            .page-indicator {
                background: rgba(0, 0, 0, 0.6);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 500;
                align-self: center;
                transition: all 0.3s ease;
            }
            
            @media (max-width: 768px) {
                .page-navigation {
                    bottom: 10px;
                    gap: 12px;
                }
                
                .nav-btn {
                    width: 40px;
                    height: 40px;
                    font-size: 20px;
                }
                
                .page-indicator {
                    padding: 6px 12px;
                    font-size: 12px;
                }
            }
        `;
        document.head.appendChild(navButtonStyles);
        
        // Add zoom controls and thumbnail guide for mobile
        if (window.innerWidth <= 768) {
            // Show thumbnail guide for mobile users
            const thumbnailGuide = document.querySelector('.thumbnail-guide');
            if (thumbnailGuide) {
                thumbnailGuide.style.display = 'flex';
                thumbnailGuide.style.alignItems = 'center';
                thumbnailGuide.style.justifyContent = 'center';
                
                // Hide the guide after animation completes
                setTimeout(() => {
                    thumbnailGuide.style.display = 'none';
                }, 2000);
            }
            
            // Add zoom controls
            const zoomControls = document.createElement('div');
            zoomControls.className = 'zoom-controls';
            
            const zoomInBtn = document.createElement('div');
            zoomInBtn.className = 'zoom-btn';
            zoomInBtn.innerHTML = '<i class=\'bx bx-zoom-in\'></i>';
            zoomInBtn.addEventListener('click', () => {
                if (state.pdfDocument) {
                    state.scale += 0.25;
                    renderPage(state.currentPage);
                    showMessage(`Zoom: ${Math.round(state.scale * 100)}%`);
                }
            });
            
            const zoomOutBtn = document.createElement('div');
            zoomOutBtn.className = 'zoom-btn';
            zoomOutBtn.innerHTML = '<i class=\'bx bx-zoom-out\'></i>';
            zoomOutBtn.addEventListener('click', () => {
                if (state.pdfDocument && state.scale > 0.5) {
                    state.scale -= 0.25;
                    renderPage(state.currentPage);
                    showMessage(`Zoom: ${Math.round(state.scale * 100)}%`);
                }
            });
            
            // Add reset zoom button
            const zoomResetBtn = document.createElement('div');
            zoomResetBtn.className = 'zoom-btn';
            zoomResetBtn.innerHTML = '<i class=\'bx bx-reset\'></i>';
            zoomResetBtn.addEventListener('click', () => {
                if (state.pdfDocument) {
                    state.scale = 1.5;
                    renderPage(state.currentPage);
                    showMessage('Zoom reset');
                }
            });
            
            zoomControls.appendChild(zoomOutBtn);
            zoomControls.appendChild(zoomResetBtn);
            zoomControls.appendChild(zoomInBtn);
            document.body.appendChild(zoomControls);
        }
        
        // Add drop zone event listeners for the whole document
        document.addEventListener('dragenter', (e) => {
            // Check if dragging from outside (files) vs internal thumbnail
            if (e.dataTransfer.types.includes('Files')) {
                isDragFromOutside = true;
                isDragFromThumbnail = false;
            } else {
                isDragFromOutside = false;
                isDragFromThumbnail = true;
            }
        });
        
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Only show the drop overlay for external files, not internal drag
            if (isDragFromOutside && !isDragFromThumbnail) {
                document.body.classList.add('drag-over');
            }
        });
        
        document.addEventListener('dragleave', (e) => {
            if (e.target === document.body || e.target === document.documentElement) {
                document.body.classList.remove('drag-over');
            }
        });
        
        document.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('drag-over');
            
            // Only handle external file drops, not internal thumbnail drops
            if (isDragFromOutside && e.dataTransfer.files.length && e.dataTransfer.files[0].type === 'application/pdf') {
                const file = e.dataTransfer.files[0];
                await loadPDF(file);
                showMessage(`Loaded PDF: ${file.name}`);
            }
            
            // Reset drag tracking
            isDragFromOutside = false;
            isDragFromThumbnail = false;
        });
        
        // Add floating action button for mobile
        if (window.innerWidth <= 768) {
            const floatingBtn = document.createElement('div');
            floatingBtn.className = 'floating-add-btn animate__animated animate__bounceIn';
            floatingBtn.innerHTML = `
                <i class='bx bx-plus'></i>
            `;
            floatingBtn.addEventListener('click', () => {
                floatingBtn.classList.add('animate__rubberBand');
                setTimeout(() => {
                    addPagesFromPDF();
                    setTimeout(() => {
                        floatingBtn.classList.remove('animate__rubberBand');
                    }, 1000);
                }, 300);
            });
            document.body.appendChild(floatingBtn);
        }

        // Enhanced message system with different types
        function showMessage(text, duration = 3000, type = 'info') {
            console.log("Message:", text);
            messageBox.textContent = text;
            messageBox.style.display = 'block';
            
            // Remove previous type classes
            messageBox.className = 'message';
            
            // Add type-specific styling
            switch(type) {
                case 'error':
                    messageBox.style.background = 'linear-gradient(135deg, #e63946 0%, #d62839 100%)';
                    messageBox.style.borderLeft = '4px solid #fff';
                    break;
                case 'success':
                    messageBox.style.background = 'linear-gradient(135deg, #06d6a0 0%, #048a81 100%)';
                    messageBox.style.borderLeft = '4px solid #fff';
                    break;
                case 'warning':
                    messageBox.style.background = 'linear-gradient(135deg, #f72585 0%, #b5179e 100%)';
                    messageBox.style.borderLeft = '4px solid #fff';
                    break;
                default:
                    messageBox.style.background = 'var(--gradient-accent)';
                    messageBox.style.borderLeft = '4px solid white';
            }
            
            // If there's an existing timer, clear it
            if (messageBox.timer) {
                clearTimeout(messageBox.timer);
            }
            
            // Add animation
            messageBox.style.animation = 'none';
            setTimeout(() => {
                messageBox.style.animation = 'slideDown 0.3s ease forwards';
            }, 10);
            
            // Set a timer to hide the message
            messageBox.timer = setTimeout(() => {
                messageBox.style.animation = 'none';
                messageBox.style.opacity = '1';
                
                setTimeout(() => {
                    messageBox.style.opacity = '0';
                    messageBox.style.transform = 'translateX(-50%) translateY(-20px)';
                    
                    setTimeout(() => {
                        messageBox.style.display = 'none';
                        messageBox.style.transform = 'translateX(-50%) translateY(0)';
                        messageBox.style.opacity = '1';
                    }, 300);
                }, 10);
            }, duration);
        }
        
        // Enhanced error handling
        function handleError(error, context = '') {
            console.error(`Error in ${context}:`, error);
            
            let userMessage = 'An error occurred';
            if (context) {
                userMessage = `Error ${context}`;
            }
            
            // Provide helpful error messages based on error type
            if (error.name === 'InvalidPDFException') {
                userMessage = 'Invalid PDF file. Please select a valid PDF document.';
            } else if (error.name === 'MissingPDFException') {
                userMessage = 'PDF file appears to be corrupted or incomplete.';
            } else if (error.name === 'UnexpectedResponseException') {
                userMessage = 'Network error. Please check your internet connection.';
            } else if (error.message) {
                userMessage += ': ' + error.message;
            }
            
            showMessage(userMessage, 5000, 'error');
        }

        // Function to handle file upload
        async function handleFileUpload(event) {
            console.log("File upload triggered");
            const file = event.target.files[0];
            if (file && file.type === 'application/pdf') {
                console.log("Valid PDF file selected:", file.name);
                // Add pdf-loaded class to body for mobile layout
                document.body.classList.add('pdf-loaded');
                await loadPDF(file);
            } else {
                console.log("Invalid file or no file selected");
                handleError(new Error("Invalid file format"), "selecting file");
            }
            // Reset input so the same file can be selected again
            fileInput.value = '';
        }

        // Function to load PDF
        async function loadPDF(file) {
            console.log("Loading PDF:", file.name);
            
            // Hide empty state
            const emptyState = document.getElementById('empty-state');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            // Show loading state
            showLoadingState();
            
            try {
                console.log("Converting file to ArrayBuffer");
                const arrayBuffer = await file.arrayBuffer();
                state.pdfBytes = new Uint8Array(arrayBuffer);
                console.log("PDF bytes loaded, length:", state.pdfBytes.length);
                
                // Save initial state to history
                saveToHistory();
                
                // Load with PDF.js
                console.log("Creating PDF.js loading task");
                const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
                console.log("Waiting for PDF.js promise");
                state.pdfDocument = await loadingTask.promise;
                state.totalPages = state.pdfDocument.numPages;
                state.currentPage = 1;
                console.log("PDF loaded successfully, pages:", state.totalPages);
                
                // Hide loading state
                hideLoadingState();
                
                // Render thumbnails and first page
                console.log("Rendering thumbnails");
                await renderThumbnails();
                console.log("Rendering first page");
                await renderPage(state.currentPage);
                
                // Enable buttons
                downloadBtn.disabled = false;
                
                showMessage(`PDF loaded with ${state.totalPages} pages`, 3000, 'success');
            } catch (error) {
                hideLoadingState();
                
                // Show empty state again on error
                if (emptyState) {
                    emptyState.style.display = 'flex';
                }
                
                handleError(error, 'loading PDF file');
            }
        }
        
        // Show loading state
        function showLoadingState() {
            const loadingState = document.createElement('div');
            loadingState.id = 'loading-state';
            loadingState.className = 'loading-container animate__animated animate__fadeIn';
            loadingState.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading PDF...</div>
                <div style="font-size: 14px; opacity: 0.7; margin-top: 8px;">Please wait while we process your file</div>
            `;
            
            const viewer = document.getElementById('viewer-container');
            viewer.appendChild(loadingState);
        }
        
        // Hide loading state
        function hideLoadingState() {
            const loadingState = document.getElementById('loading-state');
            if (loadingState) {
                loadingState.classList.remove('animate__fadeIn');
                loadingState.classList.add('animate__fadeOut');
                setTimeout(() => {
                    if (loadingState.parentNode) {
                        loadingState.parentNode.removeChild(loadingState);
                    }
                }, 300);
            }
        }

        // Function to render thumbnails
        async function renderThumbnails() {
            console.log("Rendering thumbnails");
            // Clear previous thumbnails
            thumbnailContainer.innerHTML = '';
            
            // Create thumbnails for each page
            for (let i = 1; i <= state.totalPages; i++) {
                console.log(`Rendering thumbnail for page ${i}`);
                try {
                    const page = await state.pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 0.4 }); // Higher scale for crisp thumbnails
                    
                    const thumbnailWrapper = document.createElement('div');
                    thumbnailWrapper.className = 'thumbnail-wrapper';
                    thumbnailWrapper.dataset.pageNumber = i;
                    if (i === state.currentPage) {
                        thumbnailWrapper.classList.add('active');
                    }
                    
                    // Page number indicator
                    const pageNumber = document.createElement('div');
                    pageNumber.className = 'page-number';
                    pageNumber.textContent = i;
                    thumbnailWrapper.appendChild(pageNumber);
                    
                    // Thumbnail canvas
                    const canvas = document.createElement('canvas');
                    canvas.className = 'thumbnail';
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    thumbnailWrapper.appendChild(canvas);
                    
                    // Render PDF page to canvas
                    const renderContext = {
                        canvasContext: canvas.getContext('2d'),
                        viewport: viewport
                    };
                    console.log(`Rendering page ${i} to thumbnail canvas`);
                    await page.render(renderContext).promise;
                    console.log(`Page ${i} thumbnail rendered successfully`);
                    
                    // Action buttons
                    const actions = document.createElement('div');
                    actions.className = 'thumbnail-actions';
                    
                    // Create reorder buttons row
                    const reorderRow = document.createElement('div');
                    reorderRow.className = 'reorder-buttons';
                    reorderRow.style.display = 'flex';
                    reorderRow.style.gap = '6px';
                    reorderRow.style.marginBottom = '6px';
                    
                    const moveLeftBtn = document.createElement('button');
                    moveLeftBtn.innerHTML = '<i class="bx bx-chevron-left"></i>';
                    moveLeftBtn.title = 'Move page left';
                    moveLeftBtn.style.background = 'linear-gradient(135deg, #4895ef 0%, #4361ee 100%)';
                    moveLeftBtn.addEventListener('click', (e) => {
                        console.log(`Move left button clicked for page ${i}`);
                        e.stopPropagation();
                        if (i > 1) {
                            movePage(i, i - 1);
                        }
                    });
                    
                    const moveRightBtn = document.createElement('button');
                    moveRightBtn.innerHTML = '<i class="bx bx-chevron-right"></i>';
                    moveRightBtn.title = 'Move page right';
                    moveRightBtn.style.background = 'linear-gradient(135deg, #4895ef 0%, #4361ee 100%)';
                    moveRightBtn.addEventListener('click', (e) => {
                        console.log(`Move right button clicked for page ${i}`);
                        e.stopPropagation();
                        if (i < state.totalPages) {
                            movePage(i, i + 1);
                        }
                    });
                    
                    // Disable buttons when at edges
                    if (i === 1) {
                        moveLeftBtn.disabled = true;
                        moveLeftBtn.style.opacity = '0.5';
                        moveLeftBtn.style.cursor = 'not-allowed';
                    }
                    if (i === state.totalPages) {
                        moveRightBtn.disabled = true;
                        moveRightBtn.style.opacity = '0.5';
                        moveRightBtn.style.cursor = 'not-allowed';
                    }
                    
                    reorderRow.appendChild(moveLeftBtn);
                    reorderRow.appendChild(moveRightBtn);
                    
                    // Create action buttons row
                    const actionRow = document.createElement('div');
                    actionRow.className = 'action-buttons';
                    actionRow.style.display = 'flex';
                    actionRow.style.gap = '6px';
                    
                    const rotateBtn = document.createElement('button');
                    rotateBtn.innerHTML = '<i class="bx bx-rotate-right"></i>';
                    rotateBtn.title = 'Rotate page';
                    rotateBtn.style.background = 'linear-gradient(135deg, #06d6a0 0%, #048a81 100%)';
                    rotateBtn.addEventListener('click', (e) => {
                        console.log(`Rotate button clicked for page ${i}`);
                        e.stopPropagation();
                        rotatePage(i);
                    });
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.innerHTML = '<i class="bx bx-trash"></i>';
                    deleteBtn.title = 'Delete page';
                    deleteBtn.style.background = 'linear-gradient(135deg, #f72585 0%, #b5179e 100%)';
                    deleteBtn.addEventListener('click', (e) => {
                        console.log(`Delete button clicked for page ${i}`);
                        e.stopPropagation();
                        if (state.totalPages > 1) {
                            if (confirm(`Delete page ${i}?`)) {
                                deletePage(i);
                            }
                        } else {
                            showMessage('Cannot delete the only page', 3000, 'warning');
                        }
                    });
                    
                    actionRow.appendChild(rotateBtn);
                    actionRow.appendChild(deleteBtn);
                    
                    actions.appendChild(reorderRow);
                    actions.appendChild(actionRow);
                    thumbnailWrapper.appendChild(actions);
                    
                    // Click to select page with ripple effect
                    thumbnailWrapper.addEventListener('click', (e) => {
                        console.log(`Thumbnail clicked for page ${i}`);
                        
                        // Create ripple effect
                        const ripple = document.createElement('div');
                        ripple.style.position = 'absolute';
                        ripple.style.top = (e.clientY - thumbnailWrapper.getBoundingClientRect().top) + 'px';
                        ripple.style.left = (e.clientX - thumbnailWrapper.getBoundingClientRect().left) + 'px';
                        ripple.style.width = '0';
                        ripple.style.height = '0';
                        ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
                        ripple.style.borderRadius = '50%';
                        ripple.style.transform = 'translate(-50%, -50%)';
                        ripple.style.transition = 'width 0.6s, height 0.6s, opacity 0.6s';
                        ripple.style.opacity = '1';
                        ripple.style.zIndex = '10';
                        
                        thumbnailWrapper.appendChild(ripple);
                        
                        // Animate the ripple
                        setTimeout(() => {
                            const size = Math.max(thumbnailWrapper.clientWidth, thumbnailWrapper.clientHeight) * 2;
                            ripple.style.width = size + 'px';
                            ripple.style.height = size + 'px';
                            ripple.style.opacity = '0';
                            
                            // Remove the ripple element after animation
                            setTimeout(() => {
                                if (thumbnailWrapper.contains(ripple)) {
                                    thumbnailWrapper.removeChild(ripple);
                                }
                            }, 600);
                        }, 10);
                        
                        selectPage(i);
                    });
                
                    // Enhanced drag and drop functionality
                    thumbnailWrapper.setAttribute('draggable', true);
                    
                    thumbnailWrapper.addEventListener('dragstart', (e) => {
                        console.log(`Drag started for page ${i}`);
                        state.isDragging = true;
                        state.draggedElement = thumbnailWrapper;
                        thumbnailWrapper.classList.add('dragging');
                        
                        // Add ghost image effect
                        const ghostImg = thumbnailWrapper.cloneNode(true);
                        ghostImg.style.position = 'absolute';
                        ghostImg.style.top = '-1000px';
                        ghostImg.style.opacity = '0';
                        document.body.appendChild(ghostImg);
                        e.dataTransfer.setDragImage(ghostImg, 0, 0);
                        
                        setTimeout(() => {
                            if (document.body.contains(ghostImg)) {
                                document.body.removeChild(ghostImg);
                            }
                        }, 0);
                        
                        e.dataTransfer.setData('text/plain', i.toString());
                        console.log(`Data set for drag: ${i}`);
                    });
                    
                    thumbnailWrapper.addEventListener('dragend', () => {
                        console.log('Drag ended');
                        state.isDragging = false;
                        
                        // Animated removal of dragging class
                        thumbnailWrapper.style.transition = 'all 0.3s ease';
                        thumbnailWrapper.classList.remove('dragging');
                        
                        // Remove drop indicators with animation
                        document.querySelectorAll('.drop-indicator').forEach(el => {
                            el.style.height = '0';
                            setTimeout(() => {
                                el.style.display = 'none';
                            }, 300);
                        });
                    });
                    
                    thumbnailWrapper.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        if (state.isDragging && state.draggedElement !== thumbnailWrapper) {
                            console.log(`Dragging over page ${i}`);
                            // Show drop indicator
                            const indicator = thumbnailWrapper.querySelector('.drop-indicator') || 
                                createDropIndicator(thumbnailWrapper);
                            indicator.style.display = 'block';
                            state.dropTarget = thumbnailWrapper;
                        }
                    });
                    
                    thumbnailWrapper.addEventListener('dragleave', () => {
                        if (state.dropTarget === thumbnailWrapper) {
                            console.log(`Drag left page ${i}`);
                            const indicator = thumbnailWrapper.querySelector('.drop-indicator');
                            if (indicator) indicator.style.display = 'none';
                        }
                    });
                    
                    thumbnailWrapper.addEventListener('drop', (e) => {
                        e.preventDefault();
                        console.log(`Drop event on page ${i}`);
                        if (state.isDragging) {
                            const fromPage = parseInt(e.dataTransfer.getData('text/plain'));
                            const toPage = parseInt(thumbnailWrapper.dataset.pageNumber);
                            console.log(`Drop data: from page ${fromPage} to page ${toPage}`);
                            if (fromPage !== toPage) {
                                movePage(fromPage, toPage);
                            } else {
                                console.log('Source and destination are the same, no action needed');
                            }
                        }
                    });
                    
                    // Add drop indicator
                    createDropIndicator(thumbnailWrapper);
                    
                    // Add to container
                    thumbnailContainer.appendChild(thumbnailWrapper);
                } catch (error) {
                    console.error(`Error rendering thumbnail for page ${i}:`, error);
                }
            }
            
            // Add "Add Pages from PDF" button with animation
            const addPageBtn = document.createElement('div');
            addPageBtn.className = 'add-page-btn animate__animated animate__pulse animate__infinite animate__slower';
            addPageBtn.innerHTML = `
                <i class='bx bx-plus' style="font-size: 28px; margin-bottom: 8px;"></i>
                <span style="font-size: 14px; font-weight: 500;">Add PDF</span>
            `;
            
            // Add hover and click effects
            addPageBtn.addEventListener('mouseenter', () => {
                addPageBtn.classList.remove('animate__pulse', 'animate__infinite', 'animate__slower');
                addPageBtn.classList.add('animate__headShake');
            });
            
            addPageBtn.addEventListener('mouseleave', () => {
                addPageBtn.classList.remove('animate__headShake');
                addPageBtn.classList.add('animate__pulse', 'animate__infinite', 'animate__slower');
            });
            
            addPageBtn.addEventListener('click', () => {
                addPageBtn.classList.remove('animate__pulse', 'animate__infinite', 'animate__slower', 'animate__headShake');
                addPageBtn.classList.add('animate__rubberBand');
                
                setTimeout(() => {
                    addPagesFromPDF();
                    
                    // Reset animation after action is completed
                    setTimeout(() => {
                        addPageBtn.classList.remove('animate__rubberBand');
                        addPageBtn.classList.add('animate__pulse', 'animate__infinite', 'animate__slower');
                    }, 1000);
                }, 300);
            });
            
            thumbnailContainer.appendChild(addPageBtn);
        }

        // Create animated drop indicator
        function createDropIndicator(thumbnailWrapper) {
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            
            // Add a pulsing animation
            indicator.style.animation = 'pulse 1.5s infinite';
            
            // Add keyframe animation for pulsing
            if (!document.querySelector('#pulse-animation')) {
                const pulseStyle = document.createElement('style');
                pulseStyle.id = 'pulse-animation';
                pulseStyle.textContent = `
                    @keyframes pulse {
                        0% { opacity: 0.6; }
                        50% { opacity: 1; }
                        100% { opacity: 0.6; }
                    }
                `;
                document.head.appendChild(pulseStyle);
            }
            
            thumbnailWrapper.appendChild(indicator);
            return indicator;
        }

        // Function to render a specific page in the main viewer with improved scaling
        async function renderPage(pageNumber) {
            try {
                console.log(`Rendering page ${pageNumber} in main viewer`);
                // Clear previous content
                viewerContainer.innerHTML = '';
                
                // Get page
                const page = await state.pdfDocument.getPage(pageNumber);
                
                // Get page dimensions and rotation
                const originalWidth = page.view[2]; // Natural width
                const originalHeight = page.view[3]; // Natural height
                const rotation = page.rotate || 0; // Current rotation
                
                // Calculate container dimensions
                const containerWidth = viewerContainer.clientWidth * 0.9; // 90% of container width
                const containerHeight = viewerContainer.clientHeight * 0.9; // 90% of container height
                
                // For rotated pages (90 or 270 degrees), swap dimensions for fit calculation
                const isRotated = (rotation === 90 || rotation === 270);
                const fitWidth = isRotated ? originalHeight : originalWidth;
                const fitHeight = isRotated ? originalWidth : originalHeight;
                
                // Calculate scale to fit the page properly while maintaining aspect ratio
                let fitScale = Math.min(
                    containerWidth / fitWidth,
                    containerHeight / fitHeight
                );
                
                // Use the higher of minimum fit scale or user-defined scale
                const effectiveScale = Math.max(fitScale * 0.9, state.scale);
                
                // Get the viewport with the calculated scale
                const viewport = page.getViewport({ scale: effectiveScale });
                
                // Use higher resolution for crisp rendering
                const pixelRatio = window.devicePixelRatio || 1;
                const scaledViewport = page.getViewport({ scale: effectiveScale * pixelRatio });
                
                // Create canvas with loading animation
                const canvasContainer = document.createElement('div');
                canvasContainer.style.position = 'relative';
                canvasContainer.style.display = 'flex';
                canvasContainer.style.justifyContent = 'center';
                canvasContainer.style.alignItems = 'center';
                
                // Add loading spinner
                const spinner = document.createElement('div');
                spinner.className = 'spinner';
                spinner.style.position = 'absolute';
                spinner.style.width = '60px';
                spinner.style.height = '60px';
                spinner.style.borderRadius = '50%';
                spinner.style.border = '6px solid var(--color-gray-300)';
                spinner.style.borderTopColor = 'var(--color-primary)';
                spinner.style.animation = 'spin 1s linear infinite';
                
                // Add spinner animation
                if (!document.querySelector('#spinner-animation')) {
                    const spinnerStyle = document.createElement('style');
                    spinnerStyle.id = 'spinner-animation';
                    spinnerStyle.textContent = `
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `;
                    document.head.appendChild(spinnerStyle);
                }
                
                canvasContainer.appendChild(spinner);
                
                // Create and setup canvas with high DPI support
                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-page';
                const context = canvas.getContext('2d');
                
                // Set actual size in memory (scaled to account for extra pixel density)
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                
                // Scale the canvas back down using CSS
                canvas.style.width = viewport.width + 'px';
                canvas.style.height = viewport.height + 'px';
                
                // Scale the drawing context so everything will work at the higher ratio
                context.scale(pixelRatio, pixelRatio);
                canvas.style.opacity = '0';
                canvas.style.transform = 'scale(0.95)';
                canvas.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                
                canvasContainer.appendChild(canvas);
                viewerContainer.appendChild(canvasContainer);
                
                // Add navigation buttons
                addNavigationButtons(canvasContainer, pageNumber);
                
                // Render PDF page to canvas with high quality settings
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                    intent: 'display',
                    enableWebGL: true, // Enable WebGL acceleration if available
                    renderInteractiveForms: true
                };
                
                await page.render(renderContext).promise;
                console.log(`Page ${pageNumber} rendered successfully in main viewer`);
                
                // Show the rendered page with animation
                setTimeout(() => {
                    spinner.style.opacity = '0';
                    canvas.style.opacity = '1';
                    canvas.style.transform = 'scale(1)';
                    
                    // Remove spinner after transition
                    setTimeout(() => {
                        if (canvasContainer.contains(spinner)) {
                            canvasContainer.removeChild(spinner);
                        }
                    }, 400);
                }, 300);
                
                // Update active thumbnail
                document.querySelectorAll('.thumbnail-wrapper').forEach(thumb => {
                    if (parseInt(thumb.dataset.pageNumber) === pageNumber) {
                        thumb.classList.add('active');
                    } else {
                        thumb.classList.remove('active');
                    }
                });
                
                // Update state
                state.currentPage = pageNumber;
            } catch (error) {
                console.error('Error rendering page:', error);
                showMessage('Error rendering page', 5000);
            }
        }
        
        // Function to add navigation buttons to pages
        function addNavigationButtons(container, currentPage) {
            const navContainer = document.createElement('div');
            navContainer.className = 'page-navigation';
            
            // Previous page button
            const prevBtn = document.createElement('button');
            prevBtn.className = 'nav-btn prev-btn';
            prevBtn.innerHTML = '<i class="bx bx-chevron-left"></i>';
            prevBtn.setAttribute('aria-label', 'Previous page');
            
            // Next page button
            const nextBtn = document.createElement('button');
            nextBtn.className = 'nav-btn next-btn';
            nextBtn.innerHTML = '<i class="bx bx-chevron-right"></i>';
            nextBtn.setAttribute('aria-label', 'Next page');
            
            // Add click handlers
            prevBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    selectPage(currentPage - 1);
                }
            });
            
            nextBtn.addEventListener('click', () => {
                if (currentPage < state.totalPages) {
                    selectPage(currentPage + 1);
                }
            });
            
            // Disable buttons if at first or last page
            prevBtn.disabled = currentPage === 1;
            nextBtn.disabled = currentPage === state.totalPages;
            
            // Add page indicator between buttons
            const pageIndicator = document.createElement('div');
            pageIndicator.className = 'page-indicator';
            pageIndicator.textContent = `${currentPage} / ${state.totalPages}`;
            
            // Add buttons and indicator to navigation container
            navContainer.appendChild(prevBtn);
            navContainer.appendChild(pageIndicator);
            navContainer.appendChild(nextBtn);
            
            // Add animation for appearing
            navContainer.style.opacity = '0';
            navContainer.style.transform = 'translateY(20px)';
            
            // Add to the main container
            container.appendChild(navContainer);
            
            // Animate in
            setTimeout(() => {
                navContainer.style.opacity = '1';
                navContainer.style.transform = 'translateY(0)';
                navContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            }, 300);
            
            // Add hover effect for container to show on hover
            container.addEventListener('mouseenter', () => {
                if (navContainer.style.opacity !== '1') {
                    navContainer.style.opacity = '1';
                }
            });
            
            container.addEventListener('mouseleave', () => {
                // Keep visible on mobile
                if (window.innerWidth > 768) {
                    navContainer.style.opacity = '0.7';
                }
            });
            
            // Make sure navigation is more visible on mobile
            if (window.innerWidth <= 768) {
                navContainer.style.opacity = '1';
                
                // Add touch feedback
                [prevBtn, nextBtn].forEach(btn => {
                    btn.addEventListener('touchstart', () => {
                        if (!btn.disabled) {
                            btn.style.transform = 'scale(0.95)';
                        }
                    });
                    
                    btn.addEventListener('touchend', () => {
                        if (!btn.disabled) {
                            btn.style.transform = 'scale(1)';
                        }
                    });
                });
            }
        }

        // Function to select a page
        function selectPage(pageNumber) {
            // Ensure page number is valid
            if (pageNumber < 1 || pageNumber > state.totalPages) {
                console.log(`Invalid page number: ${pageNumber}. Valid range is 1-${state.totalPages}`);
                return;
            }
            
            console.log(`Selecting page ${pageNumber}`);
            
            // Add smooth scroll to the selected page
            const currentActive = document.querySelector('.thumbnail-wrapper.active');
            if (currentActive) {
                currentActive.classList.remove('active');
            }
            
            const thumbnails = document.querySelectorAll('.thumbnail-wrapper');
            thumbnails.forEach(thumb => {
                if (parseInt(thumb.dataset.pageNumber) === pageNumber) {
                    thumb.classList.add('active');
                    
                    // Smooth scroll to the selected thumbnail
                    thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }
            });
            
            // Add transition effect to the page rendering
            const viewerContainer = document.getElementById('viewer-container');
            const fadeEffect = document.createElement('div');
            fadeEffect.style.position = 'absolute';
            fadeEffect.style.top = '0';
            fadeEffect.style.left = '0';
            fadeEffect.style.width = '100%';
            fadeEffect.style.height = '100%';
            fadeEffect.style.backgroundColor = 'var(--color-gray-300)';
            fadeEffect.style.opacity = '0';
            fadeEffect.style.transition = 'opacity 0.3s ease';
            fadeEffect.style.zIndex = '5';
            
            viewerContainer.appendChild(fadeEffect);
            
            // Fade in
            setTimeout(() => {
                fadeEffect.style.opacity = '0.5';
                
                setTimeout(() => {
                    // Render the page
                    renderPage(pageNumber);
                    
                    // Fade out
                    setTimeout(() => {
                        fadeEffect.style.opacity = '0';
                        
                        // Remove the fade effect element
                        setTimeout(() => {
                            if (viewerContainer.contains(fadeEffect)) {
                                viewerContainer.removeChild(fadeEffect);
                            }
                        }, 300);
                    }, 100);
                }, 200);
            }, 10);
        }

        // Function to rotate a page with improved scaling
        async function rotatePage(pageNumber) {
            try {
                console.log(`Rotating page ${pageNumber}`);
                // Show loading state
                const loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'page-loading-overlay';
                loadingIndicator.innerHTML = '<div class="page-loading-spinner"></div>';
                
                // Find the current page in viewer if it's the one being rotated
                if (state.currentPage === pageNumber) {
                    const currentPageElement = viewerContainer.querySelector('.pdf-page');
                    if (currentPageElement) {
                        const container = currentPageElement.parentElement;
                        container.appendChild(loadingIndicator);
                    }
                }
                
                // Load PDF with pdf-lib
                const { PDFDocument, degrees } = PDFLib;
                const pdfDoc = await PDFDocument.load(state.pdfBytes);
                
                // Get the page and its current rotation
                const pages = pdfDoc.getPages();
                const page = pages[pageNumber - 1];
                
                // Rotate the page by 90 degrees
                const currentRotation = page.getRotation().angle;
                page.setRotation(degrees(currentRotation + 90));
                console.log(`Set rotation to ${currentRotation + 90} degrees`);
                
                // Save changes
                state.pdfBytes = await pdfDoc.save();
                
                // Save to history
                saveToHistory();
                
                // Reload the document with the new bytes
                const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
                state.pdfDocument = await loadingTask.promise;
                
                // Rerender thumbnails and current page
                await renderThumbnails();
                
                // Render the page with calculated scale that fits the new orientation
                await renderPage(pageNumber);
                
                // If we rotated a different page than the current one, go back to the current page
                if (pageNumber !== state.currentPage) {
                    await renderPage(state.currentPage);
                }
                
                showMessage(`Rotated page ${pageNumber}`, 3000, 'success');
            } catch (error) {
                console.error('Error rotating page:', error);
                handleError(error, 'rotating page');
            }
        }

        // Function to delete a page
        async function deletePage(pageNumber) {
            try {
                console.log(`Deleting page ${pageNumber}`);
                if (state.totalPages <= 1) {
                    showMessage('Cannot delete the only page', 3000);
                    return;
                }
                
                // Load PDF with pdf-lib
                const { PDFDocument } = PDFLib;
                const pdfDoc = await PDFDocument.load(state.pdfBytes);
                
                // Delete the page
                pdfDoc.removePage(pageNumber - 1);
                console.log(`Removed page at index ${pageNumber - 1}`);
                
                // Save changes
                state.pdfBytes = await pdfDoc.save();
                
                // Save to history
                saveToHistory();
                
                // Update total pages
                state.totalPages--;
                
                // If deleted current page or page after, adjust current page
                if (pageNumber <= state.currentPage) {
                    state.currentPage = Math.max(1, state.currentPage - 1);
                }
                
                // Reload the document with the new bytes
                const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
                state.pdfDocument = await loadingTask.promise;
                
                // Rerender thumbnails and current page
                await renderThumbnails();
                await renderPage(state.currentPage);
                
                showMessage(`Deleted page ${pageNumber}`);
            } catch (error) {
                console.error('Error deleting page:', error);
                showMessage('Error deleting page: ' + error.message, 5000);
            }
        }

        // Function to move a page (reorder)
        async function movePage(fromPage, toPage) {
            try {
                console.log(`Moving page from ${fromPage} to ${toPage}`);
                // Load PDF with pdf-lib
                const { PDFDocument } = PDFLib;
                const pdfDoc = await PDFDocument.load(state.pdfBytes);
                const newPdfDoc = await PDFDocument.create();
                
                // Get all pages
                const pageIndices = Array.from({ length: state.totalPages }, (_, i) => i);
                
                // Remove the source page from the array
                const sourceIndex = fromPage - 1;
                const sourcePageIndex = pageIndices.splice(sourceIndex, 1)[0];
                
                // Fix edge case for moving to adjacent positions
                let destinationIndex;
                if (toPage > fromPage) {
                    destinationIndex = toPage - 1;
                } else {
                    destinationIndex = toPage - 1;
                }
                pageIndices.splice(destinationIndex, 0, sourcePageIndex);
                
                console.log("New page order:", pageIndices);
                
                // Copy all pages in the new order
                for (const index of pageIndices) {
                    const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [index]);
                    newPdfDoc.addPage(copiedPage);
                }
                
                // Save changes
                state.pdfBytes = await newPdfDoc.save();
                
                // Save to history
                saveToHistory();
                
                // Reload the document with the new bytes
                const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
                state.pdfDocument = await loadingTask.promise;
                
                // Keep track of the current page when reordering
                if (state.currentPage === fromPage) {
                    state.currentPage = toPage;
                } else if (fromPage < state.currentPage && toPage >= state.currentPage) {
                    state.currentPage--;
                } else if (fromPage > state.currentPage && toPage <= state.currentPage) {
                    state.currentPage++;
                }
                
                // Ensure current page is valid
                state.currentPage = Math.max(1, Math.min(state.totalPages, state.currentPage));
                
                // Rerender thumbnails and current page
                await renderThumbnails();
                await renderPage(state.currentPage);
                
                showMessage(`Moved page ${fromPage} to position ${toPage}`);
            } catch (error) {
                console.error('Error moving page:', error);
                showMessage('Error moving page: ' + error.message, 5000);
            }
        }

        // Function to add pages from another PDF
        async function addPagesFromPDF() {
            try {
                if (!state.pdfBytes) {
                    showMessage('Please load a PDF first', 3000);
                    return;
                }
                
                // Create a file input for selecting another PDF
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.pdf';
                fileInput.style.display = 'none';
                
                fileInput.addEventListener('change', async (event) => {
                    const file = event.target.files[0];
                    if (file && file.type === 'application/pdf') {
                        console.log("Adding pages from PDF:", file.name);
                        
                        try {
                            // Read the new PDF file
                            const arrayBuffer = await file.arrayBuffer();
                            const newPdfBytes = new Uint8Array(arrayBuffer);
                            
                            // Load both PDFs with pdf-lib
                            const { PDFDocument } = PDFLib;
                            const existingDoc = await PDFDocument.load(state.pdfBytes);
                            const newDoc = await PDFDocument.load(newPdfBytes);
                            
                            // Get all pages from the new PDF
                            const pageCount = newDoc.getPageCount();
                            const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
                            
                            // Copy all pages from new PDF to existing PDF
                            const copiedPages = await existingDoc.copyPages(newDoc, pageIndices);
                            copiedPages.forEach(page => existingDoc.addPage(page));
                            
                            // Save the merged PDF
                            state.pdfBytes = await existingDoc.save();
                            
                            // Save to history
                            saveToHistory();
                            
                            // Update total pages
                            state.totalPages += pageCount;
                            
                            // Reload the document with the new bytes
                            const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
                            state.pdfDocument = await loadingTask.promise;
                            
                            // Rerender thumbnails and view the last added page
                            await renderThumbnails();
                            await renderPage(state.totalPages);
                            
                            showMessage(`Added ${pageCount} pages from ${file.name}`);
                        } catch (error) {
                            console.error('Error adding pages from PDF:', error);
                            showMessage('Error adding pages: ' + error.message, 5000);
                        }
                    } else {
                        handleError(new Error("Invalid file format"), "adding pages");
                    }
                    
                    // Cleanup
                    document.body.removeChild(fileInput);
                });
                
                // Add to body and trigger click
                document.body.appendChild(fileInput);
                fileInput.click();
                
            } catch (error) {
                console.error('Error in addPagesFromPDF:', error);
                showMessage('Error opening file dialog: ' + error.message, 5000);
            }
        }

        // Function to save current state to history
        function saveToHistory() {
            if (state.pdfBytes) {
                console.log("Saving state to history");
                // If we're not at the end of history, truncate
                if (state.historyIndex < state.pdfHistory.length - 1) {
                    state.pdfHistory = state.pdfHistory.slice(0, state.historyIndex + 1);
                    console.log("Truncated history to index", state.historyIndex + 1);
                }
                
                // Clone the bytes to avoid reference issues
                const bytesCopy = new Uint8Array(state.pdfBytes);
                state.pdfHistory.push(bytesCopy);
                state.historyIndex = state.pdfHistory.length - 1;
                console.log("New history index:", state.historyIndex);
                
                // Update undo/redo buttons
                updateUndoRedoButtons();
            }
        }

        // Function for undo with animation
        async function undo() {
            if (state.historyIndex > 0) {
                console.log("Performing undo operation");
                
                // Show loading state
                const viewer = document.getElementById('viewer-container');
                const prevContent = viewer.innerHTML;
                
                // Create loading animation
                const loadingContainer = document.createElement('div');
                loadingContainer.className = 'loading-container animate__animated animate__fadeIn';
                loadingContainer.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Undoing changes...</div>
                `;
                viewer.innerHTML = '';
                viewer.appendChild(loadingContainer);
                
                // Add a slight delay for better UX
                await new Promise(resolve => setTimeout(resolve, 600));
                
                state.historyIndex--;
                state.pdfBytes = new Uint8Array(state.pdfHistory[state.historyIndex]);
                
                // Reload the document with the new bytes
                const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
                state.pdfDocument = await loadingTask.promise;
                state.totalPages = state.pdfDocument.numPages;
                
                // Ensure current page is valid
                state.currentPage = Math.min(state.currentPage, state.totalPages);
                
                // Rerender
                await renderThumbnails();
                
                // Fade out loading
                loadingContainer.classList.remove('animate__fadeIn');
                loadingContainer.classList.add('animate__fadeOut');
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Render the page
                await renderPage(state.currentPage);
                
                // Update buttons
                updateUndoRedoButtons();
                
                // Flash the undo button
                const undoBtn = document.getElementById('undo-btn');
                undoBtn.classList.add('animate__animated', 'animate__flash');
                setTimeout(() => {
                    undoBtn.classList.remove('animate__animated', 'animate__flash');
                }, 1000);
                
                showMessage('Undo successful');
            }
        }

        // Function for redo with animation
        async function redo() {
            if (state.historyIndex < state.pdfHistory.length - 1) {
                console.log("Performing redo operation");
                
                // Show loading state
                const viewer = document.getElementById('viewer-container');
                const prevContent = viewer.innerHTML;
                
                // Create loading animation
                const loadingContainer = document.createElement('div');
                loadingContainer.className = 'loading-container animate__animated animate__fadeIn';
                loadingContainer.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Redoing changes...</div>
                `;
                viewer.innerHTML = '';
                viewer.appendChild(loadingContainer);
                
                // Add a slight delay for better UX
                await new Promise(resolve => setTimeout(resolve, 600));
                
                state.historyIndex++;
                state.pdfBytes = new Uint8Array(state.pdfHistory[state.historyIndex]);
                
                // Reload the document with the new bytes
                const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
                state.pdfDocument = await loadingTask.promise;
                state.totalPages = state.pdfDocument.numPages;
                
                // Ensure current page is valid
                state.currentPage = Math.min(state.currentPage, state.totalPages);
                
                // Rerender
                await renderThumbnails();
                
                // Fade out loading
                loadingContainer.classList.remove('animate__fadeIn');
                loadingContainer.classList.add('animate__fadeOut');
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Render the page
                await renderPage(state.currentPage);
                
                // Update buttons
                updateUndoRedoButtons();
                
                // Flash the redo button
                const redoBtn = document.getElementById('redo-btn');
                redoBtn.classList.add('animate__animated', 'animate__flash');
                setTimeout(() => {
                    redoBtn.classList.remove('animate__animated', 'animate__flash');
                }, 1000);
                
                showMessage('Redo successful');
            }
        }

        // Update undo/redo buttons state
        function updateUndoRedoButtons() {
            undoBtn.disabled = state.historyIndex <= 0;
            redoBtn.disabled = state.historyIndex >= state.pdfHistory.length - 1;
            console.log(`Undo button ${undoBtn.disabled ? 'disabled' : 'enabled'}, Redo button ${redoBtn.disabled ? 'disabled' : 'enabled'}`);
        }

        // Function to download the PDF with animation
        function downloadPDF() {
            if (!state.pdfBytes) {
                showMessage('No PDF to download', 3000);
                return;
            }
            
            console.log("Downloading PDF");
            
            // Show download animation
            const downloadBtn = document.getElementById('download-btn');
            const originalContent = downloadBtn.innerHTML;
            
            downloadBtn.innerHTML = `
                <i class='bx bx-loader-alt bx-spin'></i>
                Downloading...
            `;
            
            // Create and download the file
            const blob = new Blob([state.pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'edited-document.pdf';
            document.body.appendChild(a);
            
            // Add a slight delay for better UX
            setTimeout(() => {
                a.click();
                
                // Restore button after download
                setTimeout(() => {
                    downloadBtn.innerHTML = originalContent;
                    
                    // Cleanup
                    if (document.body.contains(a)) {
                        document.body.removeChild(a);
                    }
                    URL.revokeObjectURL(url);
                    
                    showMessage('PDF downloaded successfully', 3000, 'success');
                    
                }, 800);
            }, 400);
        }

        // Enhanced error handling for PDF.js operations
        window.addEventListener('error', function(e) {
            // Check if the error is related to PDF.js or PDF-lib
            if (e.filename && (e.filename.includes('pdf.js') || e.filename.includes('pdf-lib'))) {
                console.log("Caught PDF library error:", e.message);
                handleError(new Error("PDF processing error: " + e.message), "processing PDF");
                return;
            }
            
            // General script error handling
            if (e.message && e.message.includes('Script error')) {
                console.log("Cross-origin script error detected:", e);
                handleError(new Error("Network resource error. This may be due to content security restrictions."), "loading resources");
                return;
            }
        });
        
        // Global error handler with improved diagnostics
        window.onerror = function(message, source, lineno, colno, error) {
            console.log("Global error:", message, "Source:", source, "Line:", lineno);
            
            if (source && (source.includes('pdf.js') || source.includes('pdf-lib'))) {
                console.log("Global PDF library error:", message);
                handleError(new Error("PDF processing error"), "loading library");
                return true; // Prevent default browser error handling
            }
            
            // Handle CORS errors specifically
            if (message && message.toLowerCase().includes('script error')) {
                console.log("CORS error detected");
                handleError(new Error("Cross-origin resource access error. Some features may be limited."), "accessing resources");
                return true;
            }
            
            // Handle general script errors
            if (error) {
                console.log("Script error:", error.stack || error.message);
            }
        };
        
        // Promise rejection handler
        window.addEventListener('unhandledrejection', function(event) {
            console.log("Unhandled promise rejection:", event.reason);
            if (event.reason && typeof event.reason === 'object' && 
                (event.reason.message && event.reason.message.includes('PDF'))) {
                handleError(event.reason, "PDF operation");
                event.preventDefault(); // Prevent default handling
            }
        });
        
        // Show initial message with keyboard shortcuts info
        showMessage('PDF Editor loaded. Use Ctrl+O to open, arrow keys to navigate, Ctrl+Z/Y for undo/redo', 8000);
        
        // Add accessibility enhancements
        function addAccessibilityFeatures() {
            // Add ARIA labels
            document.getElementById('upload-btn').setAttribute('aria-label', 'Upload PDF file');
            document.getElementById('undo-btn').setAttribute('aria-label', 'Undo last action');
            document.getElementById('redo-btn').setAttribute('aria-label', 'Redo last action');
            document.getElementById('download-btn').setAttribute('aria-label', 'Download edited PDF');
            
            // Add focus indicators
            const style = document.createElement('style');
            style.textContent = `
                button:focus,
                .thumbnail-wrapper:focus {
                    outline: 3px solid var(--color-accent);
                    outline-offset: 2px;
                }
                
                .thumbnail-wrapper {
                    outline: none;
                }
                
                .thumbnail-wrapper[tabindex]:focus {
                    border-color: var(--color-accent);
                    box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.3);
                }
            `;
            document.head.appendChild(style);
        }
        
        // Initialize accessibility features
        addAccessibilityFeatures();