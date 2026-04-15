import React from 'react';
import styled from 'styled-components';
import { PageHeader, Card } from '../ui';

const Container = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: 32px;
`;

const Content = styled.div`
  color: var(--text-secondary);
  line-height: 1.6;
  
  h2 {
    color: var(--text-primary);
    margin-top: 24px;
    margin-bottom: 12px;
  }
`;

const TermsPage = () => {
    return (
        <Container>
            <PageHeader
                title="Terms of Service"
                description="Last Updated: February 2026"
            />

            <Card>
                <Content>
                    <h2>1. Terms</h2>
                    <p>By accessing the website at Target Logistics, you are agreeing to be bound by these terms of service, all applicable laws and regulations, and agree that you are responsible for compliance with any applicable local laws. If you do not agree with any of these terms, you are prohibited from using or accessing this site.</p>

                    <h2>2. Use License</h2>
                    <p>Permission is granted to temporarily download one copy of the materials (information or software) on Target Logistics' website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
                    <ul>
                        <li>modify or copy the materials;</li>
                        <li>use the materials for any commercial purpose, or for any public display (commercial or non-commercial);</li>
                        <li>attempt to decompile or reverse engineer any software contained on Target Logistics' website;</li>
                        <li>remove any copyright or other proprietary notations from the materials; or</li>
                        <li>transfer the materials to another person or "mirror" the materials on any other server.</li>
                    </ul>

                    <h2>3. Disclaimer</h2>
                    <p>The materials on Target Logistics' website are provided on an 'as is' basis. Target Logistics makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

                    <h2>4. Limitations</h2>
                    <p>In no event shall Target Logistics or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Target Logistics' website.</p>

                    <h2>5. Governing Law</h2>
                    <p>These terms and conditions are governed by and construed in accordance with the laws of Kuwait and you irrevocably submit to the exclusive jurisdiction of the courts in that State or location.</p>
                </Content>
            </Card>
        </Container>
    );
};

export default TermsPage;
