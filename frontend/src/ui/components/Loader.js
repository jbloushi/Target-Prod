import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top: 3px solid var(--accent-primary);
  border-radius: 50%;
  width: ${props => props.size || '24px'};
  height: ${props => props.size || '24px'};
  animation: ${spin} 1s linear infinite;
`;

const Loader = ({ size, centered }) => {
    if (centered) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <Spinner size={size} />
            </div>
        );
    }
    return <Spinner size={size} />;
};

export default Loader;
