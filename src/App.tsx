import { useState, useEffect } from "react";
import Playmat from "./components/playmat";
import RobotDashboard from "./components/status";
import ControlAreas from "./components/control";
import { getStorageItem, setStorageItem } from "./utils/storage";
import { VscScreenFull, VscScreenNormal, VscChevronUp, VscChevronDown } from "react-icons/vsc";
import { MdOutlineFullscreen, MdOutlineFullscreenExit } from "react-icons/md";
// Define a Panel interface to standardize panel components
interface Panel {
  id: string;
  title: string;
  component: React.ReactNode;
}

function App() {
  // Define the panels for the application
  const panels: Panel[] = [
    {
      id: "status",
      title: "Robot Status",
      component: <RobotDashboard />,
    },
    {
      id: "playmat",
      title: "Playmat",
      component: <Playmat />,
    },
    {
      id: "control",
      title: "Control Panel",
      component: <ControlAreas />,
    },
  ];

  // State for active panel tracking
  const [activePanel, setActivePanel] = useState(() => {
    // Try to get the previously active panel from localStorage
    try {
      const storedPanel = localStorage.getItem('activePanel');
      const panelIndex = storedPanel ? parseInt(storedPanel, 10) : 0;
      return typeof panelIndex === 'number' && !isNaN(panelIndex) && panelIndex >= 0 && panelIndex < panels.length
        ? panelIndex
        : 0; // Default to first panel
    } catch (error) {
      console.warn('Could not load active panel from storage:', error);
      return 0; // Default to first panel
    }
  });
  
  // State for vertical panel stacking on small screens
  const [verticalPanel, setVerticalPanel] = useState(() => {
    // Try to get the previously active vertical panel from localStorage
    try {
      const storedPanel = localStorage.getItem('verticalPanel');
      const panelIndex = storedPanel ? parseInt(storedPanel, 10) : 0;
      return typeof panelIndex === 'number' && !isNaN(panelIndex) && panelIndex >= 0 && panelIndex < panels.length
        ? panelIndex
        : 0; // Default to first panel
    } catch (error) {
      console.warn('Could not load vertical panel from storage:', error);
      return 0; // Default to first panel
    }
  });
  
  // State for half screen mode (for dual monitors)
  const [isHalfScreen, setIsHalfScreen] = useState(() => {
    try {
      const savedValue = localStorage.getItem('isHalfScreen');
      return savedValue === 'true';
    } catch (error) {
      console.warn('Could not load half screen mode setting:', error);
      return false;
    }
  });
  
  // State to track if the screen is small
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && activePanel > 0) {
        setActivePanel(prev => prev - 1);
      } else if (e.key === "ArrowRight" && activePanel < panels.length - 1) {
        setActivePanel(prev => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePanel, panels.length]);

  // Check screen size and update layout accordingly
  useEffect(() => {
    const checkScreenSize = () => {
      const smallScreen = window.innerWidth < 768;
      setIsSmallScreen(smallScreen || isHalfScreen);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, [isHalfScreen]);

  // Touch navigation state
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchEndY, setTouchEndY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
    setTouchEndY(e.targetTouches[0].clientY);
    setIsSwiping(false);
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
    setIsSwiping(true);
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!isSwiping) return;

    const horizontalDistance = touchEndX - touchStartX;
    const verticalDistance = touchEndY - touchStartY;
    
    const isHorizontalSwipe = Math.abs(horizontalDistance) > Math.abs(verticalDistance);
    
    if (isHorizontalSwipe) {
      // Horizontal swipe
      const isLeftSwipe = horizontalDistance < -50;
      const isRightSwipe = horizontalDistance > 50;
      
      if (isLeftSwipe && activePanel < panels.length - 1) {
        // Left swipe means go forward (right) in large screens
        navigateToPanel(activePanel + 1);
      } else if (isRightSwipe && activePanel > 0) {
        // Right swipe means go back (left) in large screens
        navigateToPanel(activePanel - 1);
      }
    } else {
      // Vertical swipe
      const isUpSwipe = verticalDistance < -50;
      const isDownSwipe = verticalDistance > 50;
      
      if (isUpSwipe && verticalPanel < panels.length - 1) {
        // Swiping up shows the next panel
        setVerticalPanel(prev => {
          const newValue = Math.min(prev + 1, panels.length - 1);
          try {
            localStorage.setItem('verticalPanel', newValue.toString());
          } catch (error) {
            console.warn('Could not save vertical panel index:', error);
          }
          return newValue;
        });
      } else if (isDownSwipe && verticalPanel > 0) {
        // Swiping down shows the previous panel
        setVerticalPanel(prev => {
          const newValue = Math.max(prev - 1, 0);
          try {
            localStorage.setItem('verticalPanel', newValue.toString());
          } catch (error) {
            console.warn('Could not save vertical panel index:', error);
          }
          return newValue;
        });
      }
    }
  };

  // Navigate to a specific panel
  const navigateToPanel = (index: number) => {
    if (isSmallScreen) {
        setVerticalPanel(index);
        try {
        localStorage.setItem('verticalPanel', index.toString());
        } catch (error) {
        console.warn('Could not save vertical panel setting:', error);
        }
      } else {
      if (index !== activePanel) {
        setActivePanel(index);
        try {
          localStorage.setItem('activePanel', index.toString());
        } catch (error) {
          console.warn('Could not save active panel setting:', error);
        }
      }
    }
  };

  // Vertical scroll animation positioning constants
  const topPositions = {
    0: "translateY(-100%)",
    1: "translateY(0)",
    2: "translateY(100%)",
  };
  
  const opacities = {
    0: "0.5",
    1: "1",
    2: "0.5",
  };
  
  const scales = {
    0: "0.95",
    1: "1",
    2: "0.95",
  };

  // When half-screen mode is toggled
  const toggleHalfScreen = (value: boolean) => {
    setIsHalfScreen(value);
                    try {
      localStorage.setItem('isHalfScreen', value.toString());
                    } catch (error) {
                      console.warn('Could not save half screen setting:', error);
                    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0e0e0e] text-white" style={{ fontFamily: "var(--font-display)" }}>
      {/* Header with panel titles and display toggle - Dynamic Island style moved to right */}
      <div className={`flex ${isHalfScreen ? 'justify-end pr-5' : 'justify-center'} pt-5`}>
        <header className={`p-4 bg-[#181818] shadow-lg z-10 border border-[#333333] rounded-full w-auto ${isHalfScreen ? '' : 'mx-auto'} backdrop-blur-sm relative`}>
          <div className="flex items-center px-6">
            <div className={`flex justify-center space-x-4`}>
            {panels.map((panel, index) => (
              <button
                key={panel.id}
                onClick={() => navigateToPanel(index)}
                  className={`px-6 py-3 rounded-full transition-all text-2xl md:text-3xl uppercase tracking-wider ${
                  (isSmallScreen ? verticalPanel : activePanel) === index
                      ? "bg-[#d32f2f] text-white"
                      : "bg-[#242424] hover:bg-[#2c2c2c] text-[#e0e0e0]"
                }`}
              >
                {panel.title}
              </button>
            ))}
          </div>
              <button
                onClick={() => {
                if (isHalfScreen) {
                  toggleHalfScreen(false);
                  // Will be handled by the effect based on window size
                } else {
                  toggleHalfScreen(true);
                  // Force vertical layout in half-screen mode
                  setIsSmallScreen(true);
                  }
                }}
              className="ml-4 p-3 rounded-full bg-[#242424] hover:bg-[#2c2c2c] text-2xl transform transition-transform hover:scale-110 w-12 h-12 flex items-center justify-center"
                aria-label="Toggle half screen mode"
              title={isHalfScreen ? "Switch to full screen" : "Switch to half screen"}
              >
              {isHalfScreen ? <MdOutlineFullscreenExit /> : <MdOutlineFullscreen />}
              </button>
            </div>
        </header>
        </div>

      {/* Main content area */}
      <main 
        className={`flex-1 relative overflow-hidden ${isHalfScreen ? 'flex' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Black half for dual monitor support - removed extra toggle button */}
        {isHalfScreen && (
          <div className="w-1/2 bg-[#0e0e0e] flex-shrink-0 relative flex flex-col items-center justify-center text-[#e0e0e0] hover:text-[#ff4d4d]">
            {/* Removed duplicate toggle button */}
          </div>
        )}
        {/* Large screen horizontal layout - only shown when not in half-screen mode */}
        {!isSmallScreen && (
          <div
            className="absolute inset-0 flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${activePanel * 100}%)` }}
          >
            {panels.map((panel) => (
              <div key={panel.id} className="w-full h-full flex-shrink-0">
                {panel.component}
              </div>
            ))}
          </div>
        )}

        {/* Small screen vertical layout - static positioning strategy */}
          {isSmallScreen && (
            <div className={`h-full relative ${isHalfScreen ? 'w-1/2 pl-4' : 'w-full'}`}>
            {panels.map((panel, index) => {
              // Only render visible panels to improve performance
              const isPanelVisible = Math.abs(index - verticalPanel) <= 1;
              
              if (!isPanelVisible) {
                return null;
              }
              
              // Calculate the position for the panel
              let position = 1; // Default is center (current)
              if (index < verticalPanel) {
                position = 0; // Above
              } else if (index > verticalPanel) {
                position = 2; // Below
              }
              
              return (
                <div
                  key={panel.id}
                  className="absolute inset-0 w-full transition-all duration-300 ease-out"
                  style={{
                    transform: `translateY(${topPositions[position as keyof typeof topPositions]}) scale(${scales[position as keyof typeof scales]})`,
                    opacity: opacities[position as keyof typeof opacities],
                    zIndex: position === 1 ? 10 : 5,
                  }}
                >
                  <div className={`h-full w-full flex flex-col ${isHalfScreen ? 'bg-[#181818] shadow-lg rounded-l-xl' : 'bg-[#181818]'}`}>
                    <div className="flex-1 overflow-auto">
                      <div className="h-full">
                        {panel.component}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Navigation dots - Dynamic Island style moved to right with adjusted position */}
      <div className="flex justify-end mb-5 mr-5">
        <div className={`p-3 flex ${isHalfScreen ? 'w-auto' : ''} space-x-4 bg-[#181818] z-10 rounded-full shadow-lg border border-[#333333] px-6`}>
        {panels.map((panel, index) => (
          <button
            key={index}
            onClick={() => navigateToPanel(index)}
            className={`transition-all ${
            isSmallScreen 
                ? `w-3 h-8 rounded-full ${
                  verticalPanel === index
                      ? "bg-[#d32f2f] h-10"
                      : "bg-[#2c2c2c] hover:bg-[#ff4d4d]"
                }`
                : `w-4 h-4 rounded-full ${
                  activePanel === index
                      ? "bg-[#d32f2f]"
                      : "bg-[#2c2c2c] hover:bg-[#ff4d4d]"
                }`
          }`}
            aria-label={`Go to ${panel.title}`}
          />
        ))}
          
          {/* Integrated vertical navigation buttons */}
          {isSmallScreen && (
            <>
              {verticalPanel > 0 && (
                <button 
                  onClick={() => {
                    const newValue = verticalPanel - 1;
                    setVerticalPanel(newValue);
                    try {
                      localStorage.setItem('verticalPanel', newValue.toString());
                    } catch (error) {
                      console.warn('Could not save vertical panel setting:', error);
                    }
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-[#242424] text-[#e0e0e0] hover:text-white hover:bg-[#d32f2f] text-xl shadow-lg"
                  aria-label="Previous panel"
                >
                  <VscChevronDown className="text-xl" />
                </button>
              )}
              {verticalPanel < panels.length - 1 && (
                <button 
                  onClick={() => {
                    const newValue = verticalPanel + 1;
                    setVerticalPanel(newValue);
                    try {
                      localStorage.setItem('verticalPanel', newValue.toString());
                    } catch (error) {
                      console.warn('Could not save vertical panel setting:', error);
                    }
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-[#242424] text-[#e0e0e0] hover:text-white hover:bg-[#d32f2f] text-xl shadow-lg"
                  aria-label="Next panel"
                >
                  <VscChevronUp className="text-xl" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;