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
  
  ul {
    padding-left: 20px;
  }
`;

const PrivacyPage = () => {
    return (
        <Container>
            <PageHeader
                title="Privacy Policy"
                description="Last Updated: February 2026"
            />

            <Card>
                <Content>
                    <p>Target Logistics ("us", "we", or "our") operates the Target Logistics website and application (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.</p>

                    <h2>1. Information Collection</h2>
                    <p>We collect several different types of information for various purposes to provide and improve our Service to you.</p>
                    <ul>
                        <li><strong>Personal Data:</strong> Email address, First name and last name, Phone number, Address, State, Province, ZIP/Postal code, City.</li>
                        <li><strong>Tracking Data:</strong> We use cookies and similar tracking technologies to track the activity on our Service and hold certain information.</li>
                    </ul>

                    <h2>2. Use of Data</h2>
                    <p>Target Logistics uses the collected data for various purposes:</p>
                    <ul>
                        <li>To provide and maintain the Service</li>
                        <li>To notify you about changes to our Service</li>
                        <li>To provide customer care and support</li>
                        <li>To provide analysis or valuable information so that we can improve the Service</li>
                        <li>To monitor the usage of the Service</li>
                        <li>To detect, prevent and address technical issues</li>
                    </ul>

                    <h2>3. Data Security</h2>
                    <p>The security of your data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.</p>

                    <h2>4. Service Providers</h2>
                    <p>We may employ third party companies and individuals to facilitate our Service ("Service Providers"), to provide the Service on our behalf, to perform Service-related services or to assist us in analyzing how our Service is used.</p>

                    <h2>5. Contact Us</h2>
                    <p>If you have any questions about this Privacy Policy, please contact us by email: support@targetlogistics.com</p>
                </Content>
            </Card>
        </Container>
    );
};

export default PrivacyPage;
