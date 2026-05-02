import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  margin-bottom: 32px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const TitleGroup = styled.div``;

const MainTitle = styled.h1`
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
`;

const StepInfo = styled.div`
  font-size: 14px;
  color: var(--text-secondary);
`;

const TimeEstimate = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0, 217, 184, 0.1);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-primary);
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 10px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary) 0%, #00c4a7 100%);
  width: ${props => props.$percentage}%;
  transition: width 0.3s ease;
`;

const WizardHeader = ({ title, currentStep, totalSteps, timeEstimate }) => {
    const percentage = (currentStep / totalSteps) * 100;

    return (
        <Container>
            <TitleRow>
                <TitleGroup>
                    <MainTitle>{title}</MainTitle>
                    <StepInfo>Setup | Step {currentStep} of {totalSteps}</StepInfo>
                </TitleGroup>
                <TimeEstimate>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Est: {timeEstimate}
                </TimeEstimate>
            </TitleRow>
            <ProgressBar>
                <ProgressFill $percentage={percentage} />
            </ProgressBar>
        </Container>
    );
};

export default WizardHeader;
