import React from 'react';
import styled, { css } from 'styled-components';
import { useNavigate } from 'react-router-dom';

const SidebarContainer = styled.aside`
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  padding: 24px 0;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const UserProfile = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 12px 20px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 20px;
`;

const Avatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--bg-primary);
`;

const UserInfo = styled.div`
  text-align: center;
  
  h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }
  
  p {
    font-size: 11px;
    color: var(--text-secondary);
    margin: 0;
  }
`;

const NavList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const NavItem = styled.li`
  margin-bottom: 4px;
`;

const NavLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  padding: 12px 8px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 11px;
  font-weight: 500;
  transition: var(--transition-base);
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    background: rgba(0, 217, 184, 0.05);
  }

  ${props => props.$active && css`
    color: var(--text-primary);
    background: rgba(0, 217, 184, 0.1);
  `}

  ${props => props.$disabled && css`
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent !important;
    
    &:hover {
        color: var(--text-secondary);
    }
  `}
`;

const Sidebar = ({ user, items = [], activeItem }) => {
  const navigate = useNavigate();

  return (
    <SidebarContainer>
      <UserProfile>
        <Avatar>{user?.name?.[0] || 'U'}</Avatar>
        <UserInfo>
          <h3>{user?.name || 'User'}</h3>
          <p>{user?.role || 'Staff'}</p>
        </UserInfo>
      </UserProfile>
      <NavList>
        {items.map((item, index) => (
          <NavItem key={index}>
            <NavLink
              $active={activeItem === item.id}
              $disabled={item.disabled}
              title={item.disabled ? "Coming Soon" : item.label}
              onClick={() => !item.disabled && item.path && navigate(item.path)}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          </NavItem>
        ))}
      </NavList>
    </SidebarContainer>
  );
};

export default Sidebar;
