import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import { useAuth } from '../../context/AuthContext';
import { financeService } from '../../services/api';

const HeaderContainer = styled.header`
  height: 70px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 1000;
  backdrop-filter: blur(10px);
`;

const BrandMark = styled.div`
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.3px;
`;

const SearchContainer = styled.div`
  position: relative;
  width: clamp(220px, 35vw, 400px);

  input {
    width: 100%;
    height: 40px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    padding: 0 16px 0 44px;
    color: var(--text-primary);
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    transition: all 0.2s ease;

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 3px rgba(0, 217, 184, 0.1);
    }
  }

  svg {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
  }
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const BalancePill = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: rgba(0, 217, 184, 0.1);
  border-radius: 20px;
  color: var(--accent-primary);
  font-weight: 600;
  font-size: 14px;
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  &:hover {
    border-color: var(--accent-primary);
  }
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: 50px;
  right: 0;
  width: 200px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  padding: 8px;
  display: ${props => props.$isOpen ? 'block' : 'none'};
  z-index: 1001;
`;

const MenuItem = styled.button`
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 10px;

  &:hover {
    background: var(--bg-tertiary);
  }

  &.danger {
    color: var(--accent-error);
    &:hover {
      background: rgba(239, 68, 68, 0.1);
    }
  }
`;

const Header = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef();
  const navigate = useNavigate();
  const [financeSummary, setFinanceSummary] = useState(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const loadFinance = async () => {
      if (!user?.organization) return;
      try {
        const response = await financeService.getBalance();
        setFinanceSummary(response.data);
      } catch (error) {
        console.error('Failed to fetch finance summary:', error);
      }
    };

    loadFinance();
  }, [user?.organization]);

  return (
    <HeaderContainer>
      {isAuthenticated ? (
        <SearchContainer>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search shipments, clients, or orders..." />
        </SearchContainer>
      ) : (
        <BrandMark>3PLogistics Solution</BrandMark>
      )}

      <RightSection>
        {isAuthenticated && user && (
          <BalancePill>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            {parseFloat(financeSummary?.balance || 0).toFixed(3)} KD
          </BalancePill>
        )}

        {!isAuthenticated && (
          <>
            <Button variant="secondary" onClick={() => navigate('/track')}>
              Track Shipment
            </Button>
            <Button variant="primary" onClick={() => navigate('/')}>
              Sign In
            </Button>
          </>
        )}

        {isAuthenticated && (
          <Button
            variant="primary"
            onClick={() => navigate('/create')}
            icon={
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            New Shipment
          </Button>
        )}

        {isAuthenticated && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <UserAvatar onClick={() => setMenuOpen(!menuOpen)}>
              {user?.avatar ? (
                <img src={user.avatar} alt="User" />
              ) : (
                <span>{user?.name?.[0] || 'U'}</span>
              )}
            </UserAvatar>

            <DropdownMenu $isOpen={menuOpen}>
              <MenuItem onClick={() => { navigate('/settings'); setMenuOpen(false); }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </MenuItem>
              <MenuItem className="danger" onClick={() => { logout(); setMenuOpen(false); }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </MenuItem>
            </DropdownMenu>
          </div>
        )}
      </RightSection>
    </HeaderContainer>
  );
};

export default Header;
