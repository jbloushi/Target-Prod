import styled from 'styled-components';

const AlertContainer = styled.div`
  padding: 12px 16px;
  background: ${props => props.$bg};
  border: 1px solid ${props => props.$border};
  color: ${props => props.$color};
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  line-height: 1.5;
`;

const Alert = ({ severity = 'info', children, title }) => {
    let style = {
        bg: 'rgba(66, 165, 245, 0.1)',
        border: 'rgba(66, 165, 245, 0.3)',
        color: '#90caf9'
    };

    if (severity === 'error') {
        style = { bg: 'rgba(239, 83, 80, 0.1)', border: 'rgba(239, 83, 80, 0.3)', color: '#ef9a9a' };
    } else if (severity === 'success') {
        style = { bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)', color: '#a5d6a7' };
    } else if (severity === 'warning') {
        style = { bg: 'rgba(255, 167, 38, 0.1)', border: 'rgba(255, 167, 38, 0.3)', color: '#ffcc80' };
    }

    return (
        <AlertContainer $bg={style.bg} $border={style.border} $color={style.color}>
            <div>
                {title && <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>}
                {children}
            </div>
        </AlertContainer>
    );
};

export default Alert;
