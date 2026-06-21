# Pro – IoT Vehicle Monitoring Dashboard

A real-time IoT-based vehicle monitoring system that tracks fuel level, tire pressure (TPMS), GPS location, and theft detection using ESP32, MQTT, Node.js, and React.

This system provides a live dashboard accessible globally via cloud deployment.

---

# Features

• Real-time fuel level monitoring using ultrasonic sensor  
• Fuel theft detection system  
• Tire Pressure Monitoring System (TPMS) using BMP180 sensors  
• Live GPS tracking with map visualization  
• MQTT-based real-time communication  
• Cloud-hosted dashboard accessible worldwide  
• Modern React dashboard UI  
• Node.js backend API  
• Global deployment using Render  

---

# System Architecture

ESP32 → MQTT Broker → Node.js Server → React Dashboard → Cloud (Render)

---

# Technologies Used

## Hardware
• ESP32  
• Ultrasonic Sensor (Fuel level)  
• BMP180 Pressure Sensors (TPMS)  
• GPS Module  

## Software
• Arduino IDE
• MQTT (test.mosquitto.org)
• Node.js
• Express.js
• React.js
• Leaflet Maps
• Render Cloud
• GitHub

---

# Data Flow

ESP32 publishes data via MQTT: broker.hivemq.com

