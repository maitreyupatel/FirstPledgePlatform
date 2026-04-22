import React, { useState, useEffect } from 'react';

const LiquidGlassUI = () => {
  const [activeNav, setActiveNav] = useState('home');
  const [scrollY, setScrollY] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const styles = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --primary: #8B5CF6;
      --secondary: #EC4899;
      --accent: #F97316;
      --dark-base: #0F172A;
      --dark-secondary: #1E293B;
      --glass-white: rgba(255, 255, 255, 0.10);
      --glass-white-high: rgba(255, 255, 255, 0.15);
      --glass-border: rgba(255, 255, 255, 0.20);
      --text-primary: #F8FAFC;
      --text-secondary: #CBD5E1;
      --shadow-sm: 0 4px 16px rgba(0, 0, 0, 0.1);
      --shadow-md: 0 8px 32px rgba(0, 0, 0, 0.2);
      --shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.3);
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background: linear-gradient(135deg, #0F172A 0%, #1a1f3a 25%, #2d1b4e 50%, #1E293B 75%, #0F172A 100%);
      background-size: 400% 400%;
      animation: gradientShift 15s ease infinite;
      color: var(--text-primary);
      overflow-x: hidden;
      position: relative;
    }

    @keyframes gradientShift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: radial-gradient(ellipse 80% 50% at 50% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
      pointer-events: none;
      z-index: 1;
    }

    .app-container {
      position: relative;
      z-index: 2;
      min-height: 100vh;
    }

    /* NAVIGATION BAR - RESPONSIVE SOLUTION */
    .nav-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      backdrop-filter: blur(20px);
      background: var(--glass-white);
      border-bottom: 1px solid var(--glass-border);
      padding: 1rem 2rem;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: slideDown 0.6s ease-out;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .nav-container {
      max-width: 1280px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary), var(--secondary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.5px;
      animation: fadeInDown 0.8s ease-out;
    }

    .nav-links {
      display: none;
      list-style: none;
      gap: 2rem;
      align-items: center;
    }

    .nav-link {
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 500;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      transition: all 0.3s ease;
      position: relative;
      cursor: pointer;
    }

    .nav-link::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      transform: translateX(-50%);
      transition: width 0.3s ease;
    }

    .nav-link:hover {
      color: var(--text-primary);
      background: var(--glass-white-high);
    }

    .nav-link:hover::after {
      width: 80%;
    }

    .nav-link.active {
      color: var(--text-primary);
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2));
    }

    /* BOTTOM NAVIGATION - MOBILE */
    .mobile-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      backdrop-filter: blur(20px);
      background: linear-gradient(180deg, transparent, var(--glass-white));
      border-top: 1px solid var(--glass-border);
      padding: 1rem;
      display: flex;
      justify-content: space-around;
      z-index: 999;
    }

    .nav-icon {
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 0.8rem;
      flex-direction: column;
      gap: 0.25rem;
    }

    .nav-icon:hover {
      color: var(--primary);
      background: var(--glass-white-high);
      transform: translateY(-4px);
    }

    .nav-icon.active {
      color: var(--primary);
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(236, 72, 153, 0.3));
      box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
    }

    /* HERO SECTION */
    .hero {
      padding: 120px 2rem 80px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%);
      top: -200px;
      right: -200px;
      animation: float 8s ease-in-out infinite;
      pointer-events: none;
    }

    .hero::after {
      content: '';
      position: absolute;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, transparent 70%);
      bottom: -150px;
      left: -100px;
      animation: float 10s ease-in-out infinite reverse;
      pointer-events: none;
    }

    @keyframes float {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(20px, -20px); }
      50% { transform: translate(0, 20px); }
      75% { transform: translate(-20px, -10px); }
    }

    .hero-content {
      position: relative;
      z-index: 10;
      animation: fadeInUp 1s ease-out;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .hero h1 {
      font-size: clamp(2.5rem, 8vw, 4.5rem);
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 1rem;
      letter-spacing: -1px;
    }

    .hero-gradient-text {
      background: linear-gradient(135deg, var(--primary), var(--secondary), var(--accent), var(--primary));
      background-size: 300% 300%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradientFlow 8s ease infinite;
    }

    @keyframes gradientFlow {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .hero p {
      font-size: 1.125rem;
      color: var(--text-secondary);
      max-width: 600px;
      margin: 0 auto 2rem;
      line-height: 1.7;
    }

    /* GLASS CARDS SECTION */
    .features {
      padding: 80px 2rem;
      max-width: 1280px;
      margin: 0 auto;
      position: relative;
      z-index: 10;
    }

    .section-title {
      text-align: center;
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 3rem;
      animation: fadeInUp 1s ease-out 0.2s both;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
    }

    .glass-card {
      backdrop-filter: blur(20px);
      background: var(--glass-white);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      padding: 2rem;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      position: relative;
      overflow: hidden;
      animation: fadeInUp 0.8s ease-out;
      animation-fill-mode: both;
    }

    .glass-card:nth-child(1) { animation-delay: 0.1s; }
    .glass-card:nth-child(2) { animation-delay: 0.2s; }
    .glass-card:nth-child(3) { animation-delay: 0.3s; }
    .glass-card:nth-child(4) { animation-delay: 0.4s; }
    .glass-card:nth-child(5) { animation-delay: 0.5s; }
    .glass-card:nth-child(6) { animation-delay: 0.6s; }

    .glass-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      transition: left 0.5s ease;
    }

    .glass-card:hover::before {
      left: 100%;
    }

    .glass-card:hover {
      background: var(--glass-white-high);
      border-color: var(--primary);
      transform: translateY(-8px);
      box-shadow: 0 20px 40px rgba(139, 92, 246, 0.3);
    }

    .card-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      filter: drop-shadow(0 4px 8px rgba(139, 92, 246, 0.3));
    }

    .card-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .card-text {
      color: var(--text-secondary);
      line-height: 1.7;
      font-size: 0.95rem;
    }

    /* SHOWCASE SECTION */
    .showcase {
      padding: 80px 2rem;
      background: linear-gradient(180deg, transparent, rgba(139, 92, 246, 0.05));
      position: relative;
      overflow: hidden;
    }

    .showcase-container {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      align-items: center;
      position: relative;
      z-index: 10;
    }

    .showcase-text h2 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      line-height: 1.3;
      animation: fadeInUp 1s ease-out 0.3s both;
    }

    .showcase-text p {
      color: var(--text-secondary);
      font-size: 1.05rem;
      line-height: 1.8;
      margin-bottom: 1.5rem;
      animation: fadeInUp 1s ease-out 0.4s both;
    }

    .cta-button {
      display: inline-block;
      padding: 1rem 2.5rem;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
      animation: fadeInUp 1s ease-out 0.5s both;
      letter-spacing: 0.3px;
    }

    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(139, 92, 246, 0.6);
    }

    .cta-button:active {
      transform: translateY(0);
    }

    .showcase-visual {
      backdrop-filter: blur(20px);
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2));
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      position: relative;
      overflow: hidden;
      animation: fadeInRight 1s ease-out 0.3s both;
    }

    @keyframes fadeInRight {
      from {
        opacity: 0;
        transform: translateX(30px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .showcase-visual::before {
      content: '';
      position: absolute;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, transparent 70%);
      top: -150px;
      right: -100px;
      animation: float 6s ease-in-out infinite;
    }

    .showcase-visual::after {
      content: '';
      position: absolute;
      width: 250px;
      height: 250px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%);
      bottom: -100px;
      left: -50px;
      animation: float 8s ease-in-out infinite reverse;
    }

    .visual-content {
      position: relative;
      z-index: 10;
      font-size: 3rem;
      text-align: center;
    }

    /* STATS SECTION */
    .stats {
      padding: 80px 2rem;
      position: relative;
      z-index: 10;
    }

    .stats-container {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
    }

    .stat-card {
      backdrop-filter: blur(15px);
      background: var(--glass-white);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      transition: all 0.3s ease;
      animation: fadeInUp 1s ease-out;
      animation-fill-mode: both;
    }

    .stat-card:nth-child(1) { animation-delay: 0.1s; }
    .stat-card:nth-child(2) { animation-delay: 0.2s; }
    .stat-card:nth-child(3) { animation-delay: 0.3s; }
    .stat-card:nth-child(4) { animation-delay: 0.4s; }

    .stat-card:hover {
      background: var(--glass-white-high);
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(139, 92, 246, 0.2);
    }

    .stat-number {
      font-size: 2.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 0.5rem;
    }

    .stat-label {
      color: var(--text-secondary);
      font-size: 0.95rem;
      font-weight: 500;
    }

    /* FOOTER */
    .footer {
      padding: 60px 2rem 100px;
      border-top: 1px solid var(--glass-border);
      backdrop-filter: blur(10px);
      background: var(--glass-white);
      position: relative;
      z-index: 10;
    }

    .footer-content {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--glass-border);
    }

    .footer-section h3 {
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .footer-links {
      list-style: none;
    }

    .footer-links li {
      margin-bottom: 0.75rem;
    }

    .footer-link {
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.3s ease;
      font-size: 0.95rem;
    }

    .footer-link:hover {
      color: var(--primary);
    }

    .footer-bottom {
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    /* RESPONSIVE DESIGN */
    @media (max-width: 768px) {
      .nav-bar {
        padding: 1rem;
      }

      .logo {
        font-size: 1.25rem;
      }

      .nav-links {
        display: none !important;
      }

      .mobile-nav {
        padding: 0.75rem 0.5rem;
      }

      .nav-icon {
        width: 45px;
        height: 45px;
        font-size: 0.7rem;
      }

      .hero {
        padding: 100px 1.5rem 70px;
      }

      .hero h1 {
        font-size: 2rem;
      }

      .hero p {
        font-size: 1rem;
      }

      .features {
        padding: 60px 1.5rem;
      }

      .features-grid {
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }

      .glass-card {
        padding: 1.5rem;
      }

      .showcase-container {
        grid-template-columns: 1fr;
        gap: 2rem;
      }

      .showcase-text h2 {
        font-size: 1.75rem;
      }

      .showcase-visual {
        min-height: 300px;
        order: -1;
      }

      .section-title {
        font-size: 1.75rem;
      }

      .stats-container {
        grid-template-columns: 1fr 1fr;
      }

      .footer-content {
        grid-template-columns: 1fr;
      }

      .cta-button {
        width: 100%;
      }
    }

    @media (min-width: 769px) {
      .mobile-nav {
        display: none;
      }

      .nav-links {
        display: flex !important;
      }

      body {
        padding-bottom: 0;
      }

      .hero {
        padding-bottom: 120px;
      }
    }

    @media (max-width: 480px) {
      .hero h1 {
        font-size: 1.5rem;
      }

      .stats-container {
        grid-template-columns: 1fr;
      }

      .showcase-text h2 {
        font-size: 1.5rem;
      }

      .section-title {
        font-size: 1.5rem;
      }

      .nav-container {
        padding: 0 1rem;
      }
    }

    /* SCROLL REVEAL ANIMATION */
    .scroll-reveal {
      opacity: 0;
      transform: translateY(30px);
      animation: fadeInUp 0.8s ease-out forwards;
    }

    /* PREFERS REDUCED MOTION */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* FOCUS STATES FOR ACCESSIBILITY */
    .nav-link:focus,
    .cta-button:focus,
    .nav-icon:focus {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    /* LOADING ANIMATION */
    .loading-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;

  return (
    <>
      <style>{styles}</style>
      <div className="app-container">
        {/* NAVIGATION */}
        <nav className="nav-bar">
          <div className="nav-container">
            <div className="logo">✨ LiquidMin</div>
            <ul className="nav-links">
              <li>
                <a
                  className={`nav-link ${activeNav === 'home' ? 'active' : ''}`}
                  onClick={() => setActiveNav('home')}
                >
                  Home
                </a>
              </li>
              <li>
                <a
                  className={`nav-link ${activeNav === 'features' ? 'active' : ''}`}
                  onClick={() => setActiveNav('features')}
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  className={`nav-link ${activeNav === 'showcase' ? 'active' : ''}`}
                  onClick={() => setActiveNav('showcase')}
                >
                  Showcase
                </a>
              </li>
              <li>
                <a
                  className={`nav-link ${activeNav === 'contact' ? 'active' : ''}`}
                  onClick={() => setActiveNav('contact')}
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav className="mobile-nav">
          <div
            className={`nav-icon ${activeNav === 'home' ? 'active' : ''}`}
            onClick={() => setActiveNav('home')}
          >
            <span>🏠</span>
            <span style={{ fontSize: '0.65rem' }}>Home</span>
          </div>
          <div
            className={`nav-icon ${activeNav === 'features' ? 'active' : ''}`}
            onClick={() => setActiveNav('features')}
          >
            <span>⚡</span>
            <span style={{ fontSize: '0.65rem' }}>Features</span>
          </div>
          <div
            className={`nav-icon ${activeNav === 'showcase' ? 'active' : ''}`}
            onClick={() => setActiveNav('showcase')}
          >
            <span>🎨</span>
            <span style={{ fontSize: '0.65rem' }}>Showcase</span>
          </div>
          <div
            className={`nav-icon ${activeNav === 'contact' ? 'active' : ''}`}
            onClick={() => setActiveNav('contact')}
          >
            <span>💬</span>
            <span style={{ fontSize: '0.65rem' }}>Contact</span>
          </div>
        </nav>

        {/* HERO SECTION */}
        <section className="hero">
          <div className="hero-content">
            <h1>
              Experience the Power of{' '}
              <span className="hero-gradient-text">Liquid Glass</span>
            </h1>
            <p>
              Where minimalism meets brilliance. A design philosophy that brings
              your interface to life with frosted glass elegance and purposeful
              simplicity.
            </p>
            <button className="cta-button">Explore Now →</button>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="features">
          <h2 className="section-title">Premium Features</h2>
          <div className="features-grid">
            {[
              {
                icon: '🎨',
                title: 'Glass Morphism',
                text: 'Frosted glass layers with sophisticated blur effects create depth and visual hierarchy.',
              },
              {
                icon: '✨',
                title: 'Minimalist Design',
                text: 'Every element serves a purpose. Clean, purposeful, and devoid of unnecessary complexity.',
              },
              {
                icon: '⚡',
                title: 'Lightning Fast',
                text: 'Optimized performance with CSS-based animations ensuring smooth 60fps interactions.',
              },
              {
                icon: '📱',
                title: 'Fully Responsive',
                text: 'Seamlessly adapts from mobile to desktop with intelligent layout transformations.',
              },
              {
                icon: '♿',
                title: 'Accessible',
                text: 'WCAG AA compliant with keyboard navigation and screen reader support built-in.',
              },
              {
                icon: '🌙',
                title: 'Dark Mode',
                text: 'Beautiful dark theme that\'s easy on the eyes and optimized for all lighting conditions.',
              },
            ].map((feature, idx) => (
              <div key={idx} className="glass-card">
                <div className="card-icon">{feature.icon}</div>
                <h3 className="card-title">{feature.title}</h3>
                <p className="card-text">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SHOWCASE SECTION */}
        <section className="showcase">
          <div className="showcase-container">
            <div className="showcase-text">
              <h2>
                Design That Inspires,
                <br />
                Code That Performs
              </h2>
              <p>
                Our liquid glass design system combines the luxury of glassmorphism
                with the elegance of minimalism. Every interaction is carefully
                orchestrated to delight without overwhelming.
              </p>
              <p>
                Built on modern CSS technologies with fallbacks for accessibility.
                Whether you're designing interfaces for the web or exploring UI/UX
                possibilities, this philosophy provides the foundation for
                extraordinary digital experiences.
              </p>
              <button className="cta-button">Get Started →</button>
            </div>
            <div className="showcase-visual">
              <div className="visual-content">
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌈</div>
                <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                  Interactive Design System
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS SECTION */}
        <section className="stats">
          <div className="stats-container">
            {[
              { number: '100%', label: 'Responsive' },
              { number: '60fps', label: 'Smooth' },
              { number: '∞', label: 'Customizable' },
              { number: '🚀', label: 'Performance' },
            ].map((stat, idx) => (
              <div key={idx} className="stat-card">
                <div className="stat-number">{stat.number}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer-content">
            <div className="footer-section">
              <h3>Product</h3>
              <ul className="footer-links">
                <li>
                  <a href="#" className="footer-link">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Security
                  </a>
                </li>
              </ul>
            </div>
            <div className="footer-section">
              <h3>Company</h3>
              <ul className="footer-links">
                <li>
                  <a href="#" className="footer-link">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Careers
                  </a>
                </li>
              </ul>
            </div>
            <div className="footer-section">
              <h3>Resources</h3>
              <ul className="footer-links">
                <li>
                  <a href="#" className="footer-link">
                    Docs
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Support
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Community
                  </a>
                </li>
              </ul>
            </div>
            <div className="footer-section">
              <h3>Legal</h3>
              <ul className="footer-links">
                <li>
                  <a href="#" className="footer-link">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="#" className="footer-link">
                    Cookies
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              © 2024 LiquidMin Design System. Crafted with ✨ using liquid glass
              + minimalism philosophy.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default LiquidGlassUI;