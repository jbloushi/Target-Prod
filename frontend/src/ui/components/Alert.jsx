import styled from 'styled-components';

const AlertContainer = styled.div`
  padding: 14px 18px;
  background: ${props => props.$bg};
  border: none;
  border-radius: 12px;
  color: ${props => props.$color};
  margin-bottom: 16px;
  font-size: 14px;
  font-family: 'Manrope', sans-serif;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  line-height: 1.5;
  box-shadow: ${props => props.$shadow || 'none'};
`;

const Alert = ({ severity = 'info', children, title }) => {
    let style = {
        bg: 'rgba(0, 101, 115, 0.06)',
        color: '#006573',
        shadow: '0 0 0 1px rgba(0, 101, 115, 0.1)'
    };

    if (severity === 'error') {
        style = {
            bg: 'rgba(179, 27, 37, 0.06)',
            color: '#b31b25',
            shadow: '0 0 0 1px rgba(179, 27, 37, 0.1)'
        };
    } else if (severity === 'success') {
        style = {
            bg: 'rgba(46, 125, 50, 0.06)',
            color: '#2e7d32',
            shadow: '0 0 0 1px rgba(46, 125, 50, 0.1)'
        };
    } else if (severity === 'warning') {
        style = {
            bg: 'rgba(230, 138, 0, 0.06)',
            color: '#b36b00',
            shadow: '0 0 0 1px rgba(230, 138, 0, 0.1)'
        };
    }

    return (
        <AlertContainer $bg={style.bg} $color={style.color} $shadow={style.shadow}>
            <div>
                {title && <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>}
                {children}
            </div>
        </AlertContainer>
    );
};

export default Alert;
