output "ec2_docker_host_public_ip" {
  description = "Public IP address assigned to the host by EC2"
  value       = "${aws_instance.this.public_ip}"
}

output "ec2_docker_host_instance_id" {
  description = "AWS ID for the EC2 instance used"
  value       = "${aws_instance.this.id}"
}

output "ec2_docker_host_instance_az" {
  description = "AWS Availability Zone in which the EC2 instance was created"
  value       = "${aws_instance.this.availability_zone}"
}

output "ec2_docker_host_username" {
  description = "Username that can be used to access the EC2 instance over SSH"
  value       = "${var.ec2_docker_host_instance_username}"
}

output "ec2_docker_host_security_group_id" {
  description = "Security Group ID, for attaching additional security rules externally"
  value       = "${aws_security_group.this.id}"
}
